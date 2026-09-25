// src/services/ai/agentLoop.ts —— AI 回合状态机（spec §4）：streaming ↔ executing 循环，
// 护栏（20 轮上限→优雅收尾总结 / 连续 3 败终止）、停止语义（streaming 就地 abort 传输；
// executing 当前工具做完即停，已应用编辑保留不回滚）。纯函数：状态经 deps.on 回调外写，
// engine 经 executeTool 注入。
import { i18n } from '../../i18n'
import type { ChatPhase, ToolCardData } from '../../store/chatStore'
import { assembleAssistantToolCalls, mergeToolCallChunks, parseDeltaChunk, type AiTransport, type ToolCallAcc } from './client'
import { AI_TOOL_SCHEMAS } from './tools'
import { AI_CANVAS_TOOL_SCHEMAS } from './toolsCanvas'
import type { ToolCallResult } from './tools'

/** 单回合工具循环上限（spec §4 护栏：防死循环防烧钱）；到达后不再硬停报错，
 *  而是注入收尾提示发一次无工具请求，让模型总结进度（2026-09 优雅收尾改造） */
const MAX_TOOL_ROUNDS = 20
/** 连续工具失败终止阈值 */
const MAX_FAIL_STREAK = 3

export interface TurnStop {
  stopped: boolean
  request(): void
}

export function createTurnStop(): TurnStop {
  return {
    stopped: false,
    request() {
      this.stopped = true
    },
  }
}

export type AgentHistoryMessage = { role: 'user' | 'assistant'; content: string }

export interface AgentTurnDeps {
  transport: AiTransport
  /** 消息组装：编排层负责拼 system prompt（首条），本模块把含工具结果轮次的完整数组原样透传 */
  buildMessages(messages: unknown[]): unknown[]
  executeTool: (name: string, args: unknown) => Promise<ToolCallResult>
  backupBeforeFirstEdit: () => Promise<void>
  on: {
    phase(p: ChatPhase): void
    delta(text: string): void
    finalize(): void
    card(c: ToolCardData): void
    error(text: string): void
    /** 中性信息卡（收尾降级等非故障语义），UI 走 notice 不走 error */
    notice(text: string): void
    /** 当前工具轮次（1 基，每轮 streaming 开始时发）——回合进度显示的数据源 */
    round(n: number): void
  }
}

export interface TurnInit {
  url: string
  apiKey: string
  model: string
  history: AgentHistoryMessage[]
  userText: string
  selection: string | null
}

const CARD_KIND_BY_TOOL: Record<string, ToolCardData['kind']> = {
  add_node: 'add',
  update_node_text: 'update',
  remove_node: 'remove',
  move_node: 'move',
  up_node: 'move',
  down_node: 'move',
  set_node_body: 'body',
  set_node_icon: 'icon',
  set_node_tags: 'tag',
  set_node_expand: 'expand',
  expand_all: 'expand',
  collapse_to_level: 'expand',
  add_link: 'link',
  remove_link: 'unlink',
  set_layout: 'layout',
}

/** 回合前 git 备份只保内容编辑(spec §1 裁定):视图操作(折叠/布局)不落盘,备份无意义 */
const EDIT_KINDS = new Set<ToolCardData['kind']>(['add', 'update', 'remove', 'move', 'body', 'icon', 'tag', 'link', 'unlink'])

/** OpenAI assistant tool_call 消息形态（assembleAssistantToolCalls 的产物） */
type AssistantToolCall = ReturnType<typeof assembleAssistantToolCalls>[number]

/** Ruling 1：非 Tauri 环境的错误码给专用文案，其余按网络错误原文透出 */
function transportErrorMessage(errorMessage: string | undefined): string {
  return errorMessage === 'AI_TRANSPORT_UNAVAILABLE'
    ? i18n.t('ai.turn.transportUnavailable')
    : i18n.t('ai.error.network', { message: errorMessage ?? 'unknown' })
}

/** 解析工具参数：arguments 非法按空参执行，工具自会回失败文本给 AI 自纠 */
function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

/** 流式累计器：文本增量外写 + tool_calls 分片合并；停止传染——就地 abort 掐断网络流
 *  （Task 8 契约：abort 后 start 以 'aborted' 主动收尾，不等流自然结束） */
function createStreamCollector(stop: TurnStop, transport: AiTransport, emitDelta: (text: string) => void) {
  let text = ''
  const acc = new Map<number, ToolCallAcc>()
  const handle = (data: string): void => {
    if (stop.stopped) {
      transport.abort()
      return
    }
    const p = parseDeltaChunk(data)
    if (!p) return
    if (p.text) {
      text += p.text
      emitDelta(p.text)
    }
    if (p.toolCallChunks) mergeToolCallChunks(acc, p.toolCallChunks)
  }
  return { handle, text: () => text, acc }
}

/** 首个编辑工具成功后落 git 备份恰一次（spec §6：纯闲聊回合不灌 git 历史） */
async function backupOnceBeforeFirstEdit(
  deps: AgentTurnDeps,
  kind: ToolCardData['kind'] | undefined,
  backupDone: { value: boolean },
): Promise<void> {
  if (backupDone.value || !kind || !EDIT_KINDS.has(kind)) return
  backupDone.value = true
  try {
    await deps.backupBeforeFirstEdit()
  } catch (e) {
    console.warn('AI 回合前 git 备份失败（不阻断，仍有撤销兜底）', e) // 显式出口
  }
}

/** 执行一轮工具：卡片外写、tool 结果回灌 history、停止让位与连败护栏（3 败终止）。
 *  返回 false = 回合终止（用户停止或护栏触发），已应用编辑保留不回滚 */
async function executeRoundTools(
  deps: AgentTurnDeps,
  stop: TurnStop,
  history: Array<Record<string, unknown>>,
  toolCalls: AssistantToolCall[],
  backupDone: { value: boolean },
): Promise<boolean> {
  deps.on.phase('executing')
  let failStreak = 0
  for (const call of toolCalls) {
    if (stop.stopped) return false // executing 中停止：当前工具未启动即让位（已应用编辑保留）
    const r = await deps.executeTool(call.function.name, parseToolArgs(call.function.arguments))
    const kind = CARD_KIND_BY_TOOL[call.function.name]
    if (kind) deps.on.card({ kind, ok: r.ok, text: r.detail })
    history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: r.ok, detail: r.detail, uid: r.uid }) })
    if (r.ok) {
      failStreak = 0
      await backupOnceBeforeFirstEdit(deps, kind, backupDone)
    } else if (++failStreak >= MAX_FAIL_STREAK) {
      deps.on.error(i18n.t('ai.turn.toolFailStreak'))
      return false
    }
  }
  return true
}

/** 发起一次流式请求并统一处理停止传染 / error 归因 / 定稿三态（工具轮与收尾总结共用）。
 *  phase('streaming') 在此发（收尾总结同样走流式 UI 分支）；error 归因经参数注入——
 *  工具轮走错误卡，收尾走中性 notice 降级。返回 null = 回合已终止（用户停止静默或
 *  错误/降级已外报），调用方直接返回 */
async function streamOnce(
  deps: AgentTurnDeps,
  stop: TurnStop,
  init: TurnInit,
  history: Array<Record<string, unknown>>,
  tools: unknown[] | undefined,
  onStreamError: (errorMessage: string | undefined) => void,
): Promise<{ text: string; toolCalls: AssistantToolCall[] } | null> {
  deps.on.phase('streaming')
  const stream = createStreamCollector(stop, deps.transport, deps.on.delta)
  const outcome = await deps.transport.start(
    {
      url: init.url,
      apiKey: init.apiKey,
      body: {
        model: init.model,
        messages: deps.buildMessages(history),
        // 收尾请求不带 tools：模型只能纯文本总结（条件展开，undefined 不落序列化层）
        ...(tools !== undefined ? { tools } : {}),
        stream: true,
      },
    },
    stream.handle,
  )
  // 用户停止须在 error 归因之前（终审 I2）：模型停摆（无后续 delta）时 abort 传染不
  // 触发，停止后到达的任何 outcome（含 Rust 空闲超时 120s 的 error）一律按已停止静默
  // 处理——旧序 error 分支先行会误报错误卡且锁悬挂到超时才释放；同步代码段内 stop
  // 不与 outcome 处理交错，先查 stop 无吞真错风险。已流出文本保留（chatStore 兜底
  // finalize 由编排层 finally 做）
  if (stop.stopped) return null
  if (outcome.endedWith === 'error') {
    onStreamError(outcome.errorMessage)
    return null
  }
  deps.on.finalize()
  return { text: stream.text(), toolCalls: assembleAssistantToolCalls(stream.acc) }
}

export async function runUserTurn(deps: AgentTurnDeps, stop: TurnStop, init: TurnInit): Promise<void> {
  const history: Array<Record<string, unknown>> = [...init.history]
  const userContent = init.selection
    ? `${init.userText}\n\n（用户当前选中：${init.selection}）`
    : init.userText
  history.push({ role: 'user', content: userContent })
  const backupDone = { value: false }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (stop.stopped) return // 停止传染：上一轮工具执行尾部置位时，不再发起新请求
    deps.on.round(round + 1) // 回合进度显示（1 基）：执行耗时+轮次，人工防御的判断依据
    const r = await streamOnce(
      deps,
      stop,
      init,
      history,
      [...AI_TOOL_SCHEMAS, ...AI_CANVAS_TOOL_SCHEMAS], // as const 深只读，浅拷贝落可变 unknown[]（Task 7 契约）
      (msg) => deps.on.error(transportErrorMessage(msg)),
    )
    if (r === null) return
    if (r.toolCalls.length === 0) {
      history.push({ role: 'assistant', content: r.text || '（空回复）' })
      deps.on.phase('idle')
      return
    }
    history.push({ role: 'assistant', content: r.text || null, tool_calls: r.toolCalls })
    if (!(await executeRoundTools(deps, stop, history, r.toolCalls, backupDone))) return
  }
  // 轮次上限优雅收尾（2026-09）：不再硬停报错——注入收尾提示（user 角色紧跟 tool
  // 消息合法；不进 store，下回合组装历史天然不回传零残留），末次请求不带 tools，
  // 模型只能纯文本总结进度。收尾请求自身网络失败降级中性 notice（修改已保留可继续）
  history.push({ role: 'user', content: i18n.t('ai.turn.wrapupPrompt') })
  const wrapup = await streamOnce(deps, stop, init, history, undefined, () =>
    deps.on.notice(i18n.t('ai.turn.wrapupFailed')),
  )
  if (wrapup) deps.on.phase('idle')
}
