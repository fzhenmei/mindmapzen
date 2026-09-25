// src/services/ai/toolsFiles.ts —— 案头文件域工具（spec §1.4/§1.5）：list/outline 只读，
// rename/move/create_dir 写操作过人工确认门后委托既有服务层（sidecar 三件套语义由
// renameMap/moveMap 保证）。失败不抛异常——错误文本回传 AI 自纠（agent 标准容错）。
import type { FsAdapter } from '../../types/files'
import type { ZenNode } from '../../types/tree'
import type { ToolCallResult } from './tools'
import { INVALID, joinPath, listMaps, renameMap, resolveDir } from '../workspace'
import { createDir, moveMap } from '../desk'
import { parse } from '../mdTree'

/** 未获用户确认时的统一拒绝文案（引导 AI 先出方案征求确认） */
export const NOT_CONFIRMED_DETAIL =
  '整理方案尚未获得用户确认：请先用文字列出完整方案（每个文件如何改名/移动、要建哪些目录），明确询问用户是否确认；用户确认后再执行。'

export interface FileToolEnv {
  adapter: FsAdapter
  wsDir: string
  /** 改名/移动成功后宿主回调：路径态换址（relocateMapPath）+ 列表/左树刷新 */
  onFileRelocated(oldMdPath: string, newMdPath: string): Promise<void>
  /** 建目录后宿主回调：刷左树 */
  onTreeChanged(): Promise<void>
  /** 人工确认门（spec §1.5）：写工具检查，读工具不查 */
  confirmation: { isConfirmed(): boolean }
}

/** 大纲行数上限（token 保护，spec §1.4） */
const OUTLINE_MAX_LINES = 60

export const AI_FILE_TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'list_workspace_files',
      description: '列出工作区全部导图文件（所在目录、文件名、修改日期）。整理前先调此工具了解全貌。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_outline',
      description: '读取指定导图的前两层大纲（根节点与一级子节点）。文件名不足以判断归类时调用。',
      parameters: {
        type: 'object',
        properties: {
          relDir: { type: 'string', description: '所在相对目录（根为空串）' },
          name: { type: 'string', description: '导图名（不含 .md）' },
        },
        required: ['relDir', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: '重命名导图（布局/对话历史等 sidecar 自动随同改名）。需用户确认方案后才可执行。',
      parameters: {
        type: 'object',
        properties: {
          relDir: { type: 'string', description: '所在相对目录（根为空串）' },
          name: { type: 'string', description: '原导图名（不含 .md）' },
          newName: { type: 'string', description: '新导图名（不含 .md，禁用 \\ / : * ? " < > |）' },
        },
        required: ['relDir', 'name', 'newName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: '把导图移动到目标目录（目标不存在自动创建；对话历史等 sidecar 随同移动）。需用户确认方案后才可执行。',
      parameters: {
        type: 'object',
        properties: {
          relDir: { type: 'string', description: '所在相对目录（根为空串）' },
          name: { type: 'string', description: '导图名（不含 .md）' },
          toRelDir: { type: 'string', description: '目标相对目录（根为空串）' },
        },
        required: ['relDir', 'name', 'toRelDir'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: '创建目录（可多级）。需用户确认方案后才可执行。',
      parameters: {
        type: 'object',
        properties: { relDir: { type: 'string', description: '要创建的相对目录路径' } },
        required: ['relDir'],
      },
    },
  },
] as const

/** 写工具集（过确认门）；list/outline 只读不设门 */
const WRITE_TOOLS = new Set(['rename_file', 'move_file', 'create_directory'])

type Args = Record<string, unknown>
const str = (args: Args, k: string): string => (typeof args[k] === 'string' ? (args[k] as string).trim() : '')

/** 本地日期 YYYY-MM-DD（list 展示用；不用 toISOString——UTC 会差一天） */
function localDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function handleList(env: FileToolEnv): Promise<ToolCallResult> {
  const maps = await listMaps(env.adapter, env.wsDir)
  if (maps.length === 0) return { ok: true, detail: '（工作区为空，没有任何导图文件）' }
  const sorted = [...maps].sort((a, b) =>
    `${a.relDir}/${a.name}`.localeCompare(`${b.relDir}/${b.name}`, 'zh-CN'),
  )
  const lines = sorted.map((m) =>
    `${m.relDir === '' ? '' : m.relDir + '/'}${m.name}.md（${localDate(m.modifiedAt)} 修改）`,
  )
  return { ok: true, detail: lines.join('\n') }
}

async function handleOutline(env: FileToolEnv, args: Args): Promise<ToolCallResult> {
  const relDir = str(args, 'relDir')
  const name = str(args, 'name')
  const mdPath = joinPath(resolveDir(env.wsDir, relDir), name + '.md')
  if (!(await env.adapter.exists(mdPath))) return { ok: false, detail: `文件不存在：[${relDir === '' ? '' : relDir + '/'}${name}]` }
  const r = parse(await env.adapter.readTextFile(mdPath))
  if (!r.ok) return { ok: false, detail: `文件解析失败：[${name}]（可能不是有效导图 md）` }
  const lines: string[] = []
  // walk 按 mdTree.parse 的真实树形窄化：ZenNode（text 直挂节点，children 非可选），
  // 非引擎的 data.text 盒子形状（执行时核对 src/types/tree.ts 对齐，不引 any）
  const walk = (n: ZenNode, depth: number): void => {
    if (lines.length >= OUTLINE_MAX_LINES) return
    lines.push(`${'  '.repeat(depth)}- ${n.text.replace(/\s+/g, ' ').trim()}`)
    if (depth < 1) for (const c of n.children) walk(c, depth + 1)
  }
  walk(r.tree, 0)
  const truncated = lines.length >= OUTLINE_MAX_LINES ? '\n（…已截断，仅展示前两层前 60 行）' : ''
  return { ok: true, detail: lines.join('\n') + truncated }
}

/** 服务层调用统一转译：本地化 Error → 失败 detail 回传 AI（显式出口，不吞） */
async function callService(fn: () => Promise<void>, successDetail: string): Promise<ToolCallResult> {
  try {
    await fn()
    return { ok: true, detail: successDetail }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

async function handleRename(env: FileToolEnv, args: Args): Promise<ToolCallResult> {
  const relDir = str(args, 'relDir')
  const name = str(args, 'name')
  const newName = str(args, 'newName')
  if (name === '' || newName === '') return { ok: false, detail: 'name/newName 不能为空' }
  if (INVALID.test(newName)) return { ok: false, detail: '新名称包含非法字符（禁用 \\ / : * ? " < > |）' }
  const oldMdPath = joinPath(resolveDir(env.wsDir, relDir), name + '.md')
  if (!(await env.adapter.exists(oldMdPath))) return { ok: false, detail: `文件不存在：[${relDir === '' ? '' : relDir + '/'}${name}]` }
  const r = await callService(() => renameMap(env.adapter, env.wsDir, relDir, name, newName), `已改名「${name}」→「${newName}」`)
  if (!r.ok) return r
  await env.onFileRelocated(oldMdPath, joinPath(resolveDir(env.wsDir, relDir), newName + '.md'))
  return r
}

async function handleMove(env: FileToolEnv, args: Args): Promise<ToolCallResult> {
  const relDir = str(args, 'relDir')
  const name = str(args, 'name')
  const toRelDir = str(args, 'toRelDir')
  if (name === '') return { ok: false, detail: 'name 不能为空' }
  const oldMdPath = joinPath(resolveDir(env.wsDir, relDir), name + '.md')
  if (!(await env.adapter.exists(oldMdPath))) return { ok: false, detail: `文件不存在：[${relDir === '' ? '' : relDir + '/'}${name}]` }
  let info: Awaited<ReturnType<typeof moveMap>>
  try {
    info = await moveMap(env.adapter, env.wsDir, name, relDir, toRelDir)
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
  await env.onFileRelocated(oldMdPath, info.mdPath)
  const to = toRelDir === '' ? '根目录' : `${toRelDir}/`
  // moveMap 目标重名会自动加时间后缀——实际落名如实告知 AI（防其后续引用旧名 miss）
  return info.name === name
    ? { ok: true, detail: `已移动「${name}」到 ${to}` }
    : { ok: true, detail: `目标已有同名文件，已落为「${info.name}」并移动到 ${to}` }
}

async function handleCreateDir(env: FileToolEnv, args: Args): Promise<ToolCallResult> {
  const relDir = str(args, 'relDir')
  if (relDir === '') return { ok: false, detail: 'relDir 不能为空' }
  const r = await callService(() => createDir(env.adapter, env.wsDir, relDir), `已创建目录 ${relDir}/`)
  if (!r.ok) return r
  await env.onTreeChanged()
  return r
}

export async function executeFileTool(name: string, argsRaw: unknown, env: FileToolEnv): Promise<ToolCallResult> {
  if (WRITE_TOOLS.has(name) && !env.confirmation.isConfirmed()) return { ok: false, detail: NOT_CONFIRMED_DETAIL }
  const args = (typeof argsRaw === 'object' && argsRaw !== null ? argsRaw : {}) as Args
  switch (name) {
    case 'list_workspace_files': return handleList(env)
    case 'get_file_outline': return handleOutline(env, args)
    case 'rename_file': return handleRename(env, args)
    case 'move_file': return handleMove(env, args)
    case 'create_directory': return handleCreateDir(env, args)
    default: return { ok: false, detail: `未知工具：${name}` }
  }
}
