// src/services/ai/toolsSkill.ts 测试:SkillEnv 全 mock,断言 body 组装(api_name 平铺 +
// skill_version 自动注入)、params 嵌套拒绝、未配 key、网关错误、errcode 透传、64KiB 截断。
import { describe, expect, it } from 'vitest'
import { executeSkillTool, skillToolSchemas, SKILL_TOOL_NAMES } from './toolsSkill'
import weread from '../../skills/weread/manifest'

type Entry = { manifest: typeof weread; apiKey: string }
const entries = (apiKey: string): ReadonlyMap<string, Entry> => new Map([['weread', { manifest: weread, apiKey }]])

function fakeEnv(result?: { ok: boolean; status: number; json?: unknown; error?: string }) {
  const calls: Array<{ url: string; apiKey: string; body: unknown }> = []
  const env = {
    calls,
    async callGateway(url: string, apiKey: string, body: unknown) {
      calls.push({ url, apiKey, body })
      return result ?? { ok: true, status: 200, json: { errcode: 0, data: [] } }
    },
  }
  return env
}

describe('skillToolSchemas', () => {
  it('skill enum 来自启用清单', () => {
    const schemas = skillToolSchemas([weread]) as Array<{ function: { name: string; parameters: { properties: Record<string, { enum?: string[] }> } } }>
    const invoke = schemas.find((s) => s.function.name === 'skill_invoke')!
    expect(invoke.function.parameters.properties.skill.enum).toEqual(['weread'])
  })
  it('零启用:不注册任何 skill 工具(终审 I-1:空 enum 暴露不可用工具,严格端点 400 风险)', () => {
    expect(skillToolSchemas([])).toEqual([])
  })
})

describe('executeSkillTool', () => {
  it('skill_read_doc 返回文档原文', async () => {
    const r = await executeSkillTool('skill_read_doc', { skill: 'weread', doc: 'shelf' }, fakeEnv(), entries('wrk-x'))
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('shelf')
  })
  it('skill_read_doc 未知 doc 拒绝并列出可用文档', async () => {
    const r = await executeSkillTool('skill_read_doc', { skill: 'weread', doc: 'nope' }, fakeEnv(), entries('wrk-x'))
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('search')
  })
  it('skill_invoke:body = api_name + skill_version 自动注入 + params 平铺', async () => {
    const env = fakeEnv()
    const r = await executeSkillTool('skill_invoke', { skill: 'weread', api_name: '/store/search', params: { keyword: '三体', count: 10 } }, env, entries('wrk-1'))
    expect(r.ok).toBe(true)
    expect(env.calls[0]).toMatchObject({ url: 'https://i.weread.qq.com/api/agent/gateway', apiKey: 'wrk-1' })
    expect(env.calls[0].body).toEqual({ api_name: '/store/search', skill_version: '1.0.4', keyword: '三体', count: 10 })
  })
  it('params 嵌套在 params/data/body 键内:拒绝并提示平铺', async () => {
    const env = fakeEnv()
    const r = await executeSkillTool('skill_invoke', { skill: 'weread', api_name: '/user/notebooks', params: { params: { count: 100 } } }, env, entries('wrk-1'))
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('平铺')
    expect(env.calls.length).toBe(0)
  })
  it('未配 key(resolve 落空):ok:false 指引配置', async () => {
    const r = await executeSkillTool('skill_invoke', { skill: 'weread', api_name: '/_list' }, fakeEnv(), new Map())
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('设置')
  })
  it('网关错误:错误文本回传(不抛异常)', async () => {
    const env = fakeEnv({ ok: false, status: 502, error: 'HTTP 502: bad gateway' })
    const r = await executeSkillTool('skill_invoke', { skill: 'weread', api_name: '/_list' }, env, entries('wrk-1'))
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('502')
  })
  it('errcode 非 0:回包原样回传不拦截', async () => {
    const env = fakeEnv({ ok: true, status: 200, json: { errcode: -2012, errmsg: 'key 无效' } })
    const r = await executeSkillTool('skill_invoke', { skill: 'weread', api_name: '/_list' }, env, entries('wrk-bad'))
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('-2012')
  })
  it('回包超 64KiB 截断并注明', async () => {
    const big = { data: 'x'.repeat(70 * 1024) }
    const env = fakeEnv({ ok: true, status: 200, json: big })
    const r = await executeSkillTool('skill_invoke', { skill: 'weread', api_name: '/user/notebooks', params: { count: 100 } }, env, entries('wrk-1'))
    expect(r.ok).toBe(true)
    expect(r.detail.length).toBeLessThanOrEqual(64 * 1024 + 100)
    expect(r.detail).toContain('截断')
  })
  it('未知工具名:拒绝', async () => {
    const r = await executeSkillTool('skill_x', {}, fakeEnv(), entries('wrk-1'))
    expect(r.ok).toBe(false)
  })
  it('SKILL_TOOL_NAMES 含两个工具', () => {
    expect([...SKILL_TOOL_NAMES].sort()).toEqual(['skill_invoke', 'skill_read_doc'])
  })
})
