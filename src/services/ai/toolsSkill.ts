// src/services/ai/toolsSkill.ts —— skill 域工具(spec §4.3,仿 toolsFiles 模式):
// skill_read_doc 纯本地查文档;skill_invoke 经 SkillEnv 网关调用(URL 永远来自 manifest,
// AI 只能给 skill id + api_name + params,无法诱导应用请求任意地址——spec §4.2 安全节)。
// 失败不抛异常——错误文本回传 AI 自纠(agent 标准容错)。
import { invoke } from '@tauri-apps/api/core'
import type { SkillManifest } from '../../skills/types'
import type { ToolCallResult } from './tools'

export interface SkillEnv {
  callGateway(url: string, apiKey: string, body: unknown):
    Promise<{ ok: boolean; status: number; json?: unknown; error?: string }>
}

export const SKILL_TOOL_NAMES = new Set(['skill_read_doc', 'skill_invoke'])

/** 回包截断上限(64KiB,spec §6)防炸上下文;截断时注明 */
const RESP_MAX_CHARS = 64 * 1024

/** 工具 schema(启用清单动态生成;doc 不用 enum——各 skill 文档集不同,description 引导)。
 *  零启用 = 不注册(终审 I-1):空 enum 是模型永远不可用的工具,部分严格 OpenAI 兼容
 *  端点对空 enum 数组直接 400 */
export function skillToolSchemas(enabled: readonly SkillManifest[]): unknown[] {
  if (enabled.length === 0) return []
  const ids = enabled.map((m) => m.id)
  return [
    {
      type: 'function',
      function: {
        name: 'skill_read_doc',
        description: '读取技能的参考文档。调用技能接口前必须先读对应能力文档(接口参数、字段含义、工作流)。',
        parameters: {
          type: 'object',
          properties: {
            skill: { type: 'string', enum: ids, description: '技能 id' },
            doc: { type: 'string', description: '文档名(不含 .md),可用名见技能指令的「支持的能力」表' },
          },
          required: ['skill', 'doc'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'skill_invoke',
        description: '调用技能网关接口。params 为该接口的业务参数(平铺键值,勿嵌套);skill_version 由系统自动附带。',
        parameters: {
          type: 'object',
          properties: {
            skill: { type: 'string', enum: ids, description: '技能 id' },
            api_name: { type: 'string', description: '接口名,如 /store/search;传 /_list 可查看全部接口' },
            params: { type: 'object', description: '接口业务参数(平铺键值)' },
          },
          required: ['skill', 'api_name'],
        },
      },
    },
  ]
}

type Args = Record<string, unknown>

/** resolve 落空 = 技能 id 不存在或凭据未配置(未配置 = 未启用);指引进设置配置 */
const unknownSkill = (id: string): ToolCallResult => ({
  ok: false,
  detail: `未知或未启用的技能:${id}(未配置凭据的技能不会启用,请在「设置」中配置后重试)`,
})

function handleReadDoc(
  args: Args,
  enabled: ReadonlyMap<string, { manifest: SkillManifest; apiKey: string }>,
): ToolCallResult {
  const id = typeof args.skill === 'string' ? args.skill : ''
  const doc = typeof args.doc === 'string' ? args.doc.trim() : ''
  const entry = enabled.get(id)
  if (entry === undefined) return unknownSkill(id)
  const text = entry.manifest.docs[doc]
  if (text === undefined) {
    const names = Object.keys(entry.manifest.docs).join('、')
    return { ok: false, detail: `文档不存在:${doc}。可用文档:${names}` }
  }
  return { ok: true, detail: text }
}

async function handleInvoke(
  args: Args,
  env: SkillEnv,
  enabled: ReadonlyMap<string, { manifest: SkillManifest; apiKey: string }>,
): Promise<ToolCallResult> {
  const id = typeof args.skill === 'string' ? args.skill : ''
  const apiName = typeof args.api_name === 'string' ? args.api_name.trim() : ''
  const entry = enabled.get(id)
  if (entry === undefined) return unknownSkill(id)
  if (apiName === '') return { ok: false, detail: 'api_name 不能为空' }
  const rawParams = args.params
  if (rawParams !== undefined && (typeof rawParams !== 'object' || Array.isArray(rawParams) || rawParams === null)) {
    return { ok: false, detail: 'params 必须是对象(接口业务参数的平铺键值)' }
  }
  const params = (rawParams ?? {}) as Args
  // 防嵌套(spec §6):AI 违反平铺规则时拒绝,不让回包"看似分页失效"误导后续轮次
  for (const k of ['params', 'data', 'body']) {
    if (k in params) return { ok: false, detail: `业务参数必须平铺在 params 顶层键值,不能包在「${k}」键内;如 {"keyword":"三体"} 而非 {"params":{"keyword":"三体"}}` }
  }
  const body = { api_name: apiName, skill_version: entry.manifest.skillVersion, ...params }
  const r = await env.callGateway(entry.manifest.gatewayUrl, entry.apiKey, body)
  if (!r.ok) return { ok: false, detail: `技能网关调用失败:${r.error ?? `HTTP ${r.status}`}` }
  let detail = JSON.stringify(r.json ?? {})
  if (detail.length > RESP_MAX_CHARS) detail = `${detail.slice(0, RESP_MAX_CHARS)}\n(回包过大已截断,可用更小的 count/分页参数重取)`
  return { ok: true, detail }
}

export async function executeSkillTool(
  name: string,
  argsRaw: unknown,
  env: SkillEnv,
  enabled: ReadonlyMap<string, { manifest: SkillManifest; apiKey: string }>,
): Promise<ToolCallResult> {
  const args = (typeof argsRaw === 'object' && argsRaw !== null ? argsRaw : {}) as Args
  switch (name) {
    case 'skill_read_doc': return handleReadDoc(args, enabled)
    case 'skill_invoke': return handleInvoke(args, env, enabled)
    default: return { ok: false, detail: `未知工具:${name}` }
  }
}

/** 生产 SkillEnv:走 Tauri 命令;e2e/单测经 window.__SKILL_GATEWAY_FACTORY__ 注入 fake
 *  (仿 client.ts getTransport 模式)。invoke 失败(非 Tauri 环境/命令报错)转 ok:false
 *  显式出口,不抛给回合层 */
export function getSkillGateway(): SkillEnv {
  const factory = (window as { __SKILL_GATEWAY_FACTORY__?: () => SkillEnv }).__SKILL_GATEWAY_FACTORY__
  if (factory) return factory()
  return {
    async callGateway(url, apiKey, body) {
      try {
        const r = await invoke<{ json: unknown }>('skill_gateway_post', { request: { url, apiKey, body } })
        return { ok: true, status: 200, json: r.json }
      } catch (e) {
        return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}
