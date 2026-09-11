// src/services/ai/client.ts —— AI 网络客户端（spec §2.2）：对上暴露"一次回答"级接口，
// 对下封装 Tauri 命令与 Channel；OpenAI chunk 解析与 tool_calls 分片拼装在此完成。
// transport 可注入（window.__AI_TRANSPORT_FACTORY__，单测/e2e 塞 fake 不动真网络）。
import { Channel, invoke } from '@tauri-apps/api/core'

export type StreamEndKind = 'done' | 'error' | 'aborted'

export interface ChatRequestPayload {
  url: string
  apiKey: string
  body: { model: string; messages: unknown[]; tools?: unknown[]; stream: true }
}

export interface StreamOutcome {
  endedWith: StreamEndKind
  errorMessage?: string
  status?: number
}

export interface AiTransport {
  /** 发起一次流式请求并消费到底；onDelta 收到每条原始 chunk JSON 串。
   *  结束方式三选一：done（正常）/ error（HTTP/网络/解析错，带 message）/ aborted（本地 abort）*/
  start(payload: ChatRequestPayload, onDelta: (data: string) => void): Promise<StreamOutcome>
  abort(): void
}

/** 解析单条 OpenAI chunk JSON（Rust 原样转发的 data 载荷）；非 JSON 返回 null */
export function parseDeltaChunk(data: string):
  | { text?: string; toolCallChunks?: Array<{ index: number; id?: string; name?: string; arguments?: string }>; finishReason?: string | null }
  | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null
  const choice = (parsed as { choices?: Array<{ delta?: { content?: unknown; tool_calls?: unknown }; finish_reason?: unknown }> })
    .choices?.[0]
  if (!choice) return null
  const out: { text?: string; toolCallChunks?: Array<{ index: number; id?: string; name?: string; arguments?: string }>; finishReason?: string | null } = {}
  if (typeof choice.delta?.content === 'string') out.text = choice.delta.content
  if (Array.isArray(choice.delta?.tool_calls)) {
    out.toolCallChunks = (choice.delta.tool_calls as Array<Record<string, unknown>>).map((c) => {
      const fn = (c.function ?? {}) as Record<string, unknown>
      return {
        index: typeof c.index === 'number' ? c.index : 0,
        id: typeof c.id === 'string' ? c.id : undefined,
        name: typeof fn.name === 'string' ? fn.name : undefined,
        arguments: typeof fn.arguments === 'string' ? fn.arguments : undefined,
      }
    })
  }
  if (typeof choice.finish_reason === 'string') out.finishReason = choice.finish_reason
  else if ('finish_reason' in (choice as object)) out.finishReason = null
  return Object.keys(out).length > 0 ? out : null
}

export interface ToolCallAcc { id: string; name: string; arguments: string }

/** 流式 tool_calls 分片累加：同 index 的 id/name 取首个非空、arguments 追加 */
export function mergeToolCallChunks(
  acc: Map<number, ToolCallAcc>,
  chunks: Array<{ index: number; id?: string; name?: string; arguments?: string }>,
): void {
  for (const c of chunks) {
    const cur = acc.get(c.index) ?? { id: '', name: '', arguments: '' }
    if (c.id) cur.id = c.id
    if (c.name) cur.name = c.name
    if (c.arguments) cur.arguments += c.arguments
    acc.set(c.index, cur)
  }
}

/** 组装为 OpenAI assistant 消息的 tool_calls 数组（按 index 升序） */
export function assembleAssistantToolCalls(acc: Map<number, ToolCallAcc>):
  Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, v]) => v.id && v.name)
    .map(([, v]) => ({ id: v.id, type: 'function' as const, function: { name: v.name, arguments: v.arguments || '{}' } }))
}

/** unknown → 可读错误消息（Sonar S6551：String(obj) 得 '[object Object]'，非字符串走 JSON 序列化；
 *  Rust 侧 message 恒为 string，非字符串分支纯防御） */
function toErrorMessage(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  try {
    return JSON.stringify(v) ?? ''
  } catch {
    return '' // stringify 循环引用等极端输入抛错时兜底空串；结局仍是 error，不吞信号
  }
}

/** 生产 transport：Tauri 命令 + Channel。非 Tauri 环境（jsdom/dev 浏览器/e2e web）无 invoke，
 *  start 直接以 error 收场（上层显式提示，不静默） */
export class TauriAiTransport implements AiTransport {
  private currentId: number | null = null
  private aborted = false
  private inFlightFinish: ((o: StreamOutcome) => void) | null = null

  async start(payload: ChatRequestPayload, onDelta: (data: string) => void): Promise<StreamOutcome> {
    if (!('__TAURI_INTERNALS__' in window)) {
      return { endedWith: 'error', errorMessage: 'AI_TRANSPORT_UNAVAILABLE' }
    }
    this.aborted = false
    const channel = new Channel<Record<string, unknown>>()
    return new Promise<StreamOutcome>((resolve) => {
      let settled = false
      const finish = (o: StreamOutcome) => {
        if (!settled) {
          settled = true
          this.inFlightFinish = null
          resolve(o)
        }
      }
      // abort() 需要能主动收尾本 Promise（Rust abort 后不发任何消息，无人替我们 resolve）
      this.inFlightFinish = finish
      channel.onmessage = (msg) => {
        if (this.aborted) return
        if (msg.type === 'delta' && typeof msg.data === 'string') onDelta(msg.data)
        else if (msg.type === 'error') finish({ endedWith: 'error', errorMessage: toErrorMessage(msg.message), status: typeof msg.status === 'number' ? msg.status : undefined })
        else if (msg.type === 'done') finish({ endedWith: 'done' })
        else if (msg.type === 'end' && !settled) finish({ endedWith: 'error', errorMessage: 'AI_STREAM_ENDED_WITHOUT_DONE' })
      }
      invoke<number>('ai_chat_start', { channel, request: { url: payload.url, apiKey: payload.apiKey, body: payload.body } })
        .then((id) => {
          this.currentId = id
          if (this.aborted) this.abort() // 竞态：abort 先于拿到 id
        })
        .catch((e: unknown) => finish({ endedWith: 'error', errorMessage: toErrorMessage(e) }))
    })
  }

  abort(): void {
    this.aborted = true
    // 本地收尾在先（Rust abort 后不发消息，Promise 只能自己 resolve）
    this.inFlightFinish?.({ endedWith: 'aborted' })
    this.inFlightFinish = null
    const id = this.currentId
    if (id !== null && '__TAURI_INTERNALS__' in window) {
      void invoke('ai_chat_abort', { id }).catch((e: unknown) => {
        console.warn('AI abort 失败（进程可能已退出，无害）', e) // 显式出口
      })
    }
    this.currentId = null
  }
}

/** 取 transport：e2e/单测经 window.__AI_TRANSPORT_FACTORY__ 注入 fake；生产走 Tauri */
export function getTransport(): AiTransport {
  const factory = (window as { __AI_TRANSPORT_FACTORY__?: () => AiTransport }).__AI_TRANSPORT_FACTORY__
  return factory ? factory() : new TauriAiTransport()
}
