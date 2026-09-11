// src/services/ai/agentLoop.ts —— AI 回合状态机（spec §4）：streaming ↔ executing 循环，
// 护栏（12 轮 / 连续 3 败）、停止语义（streaming 中止传输；executing 当前工具做完即停，
// 已应用编辑保留不回滚）。纯函数：状态经 deps.on 回调外写，engine 经 executeTool 注入。
import { i18n } from '../../i18n'
import type { ChatPhase, ToolCardData } from '../../store/chatStore'
import { assembleAssistantToolCalls, mergeToolCallChunks, parseDeltaChunk, type AiTransport } from './client'
import { AI_TOOL_SCHEMAS } from './tools'
import type { ToolCallResult } from './tools'

/** 单回合工具循环上限（spec §4 护栏：防死循环防烧钱） */
const MAX_TOOL_ROUNDS = 12
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
}

export async function runUserTurn(deps: AgentTurnDeps, stop: TurnStop, init: TurnInit): Promise<void> {
  const history: Array<Record<string, unknown>> = [...init.history]
  const userContent = init.selection
    ? `${init.userText}\n\n（用户当前选中：${init.selection}）`
    : init.userText
  history.push({ role: 'user', content: userContent })
  let backupDone = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    deps.on.phase('streaming')
    let text = ''
    const acc = new Map<number, { id: string; name: string; arguments: string }>()
    const outcome = await deps.transport.start(
      {
        url: init.url,
        apiKey: init.apiKey,
        body: {
          model: init.model,
          messages: deps.buildMessages(history),
          tools: [...AI_TOOL_SCHEMAS], // as const 深只读，浅拷贝落可变 unknown[]（Task 7 契约）
          stream: true,
        },
      },
      (data) => {
        if (stop.stopped) return
        const p = parseDeltaChunk(data)
        if (!p) return
        if (p.text) {
          text += p.text
          deps.on.delta(p.text)
        }
        if (p.toolCallChunks) mergeToolCallChunks(acc, p.toolCallChunks)
      },
    )
    if (outcome.endedWith === 'error') {
      // Ruling 1：非 Tauri 环境（web/e2e）的特判码给专用文案，其余按网络错误原文透出
      deps.on.error(
        outcome.errorMessage === 'AI_TRANSPORT_UNAVAILABLE'
          ? i18n.t('ai.turn.transportUnavailable')
          : i18n.t('ai.error.network', { message: outcome.errorMessage ?? 'unknown' }),
      )
      return
    }
    if (stop.stopped) return // 用户停止：已流出文本保留（chatStore 兜底 finalize 由编排层 finally 做）
    deps.on.finalize()

    const toolCalls = assembleAssistantToolCalls(acc)
    if (toolCalls.length === 0) {
      history.push({ role: 'assistant', content: text || '（空回复）' })
      deps.on.phase('idle')
      return
    }
    history.push({ role: 'assistant', content: text || null, tool_calls: toolCalls })

    deps.on.phase('executing')
    let failStreak = 0
    for (const call of toolCalls) {
      if (stop.stopped) return // executing 中停止：当前工具未启动即让位（已应用编辑保留）
      let args: unknown
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        args = {} // arguments 非法按空参执行，工具自会回失败文本给 AI
      }
      const r = await deps.executeTool(call.function.name, args)
      const kind = CARD_KIND_BY_TOOL[call.function.name]
      if (kind) deps.on.card({ kind, ok: r.ok, text: r.detail })
      history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: r.ok, detail: r.detail, uid: r.uid }) })
      if (!r.ok) {
        failStreak++
        if (failStreak >= MAX_FAIL_STREAK) {
          deps.on.error(i18n.t('ai.turn.toolFailStreak'))
          return
        }
      } else {
        failStreak = 0
        // 首个编辑工具成功前落 git 备份（spec §6：纯闲聊回合不灌 git 历史）
        if (!backupDone && kind) {
          backupDone = true
          try {
            await deps.backupBeforeFirstEdit()
          } catch (e) {
            console.warn('AI 回合前 git 备份失败（不阻断，仍有撤销兜底）', e) // 显式出口
          }
        }
      }
    }
  }
  deps.on.error(i18n.t('ai.turn.roundLimit'))
}
