// src/store/chatStore.ts —— AI 对话 UI 状态（spec §7）：纯状态仓，回合编排在 ChatPanel
// （agentLoop 是纯函数经回调写这里）。会话 v1 内存态：切导图 reset（回合期间本就禁切换）。
import { create } from 'zustand'

export type ChatPhase = 'idle' | 'streaming' | 'executing'

export interface ToolCardData {
  kind: 'add' | 'update' | 'remove' | 'move'
  ok: boolean
  text: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  cards?: ToolCardData[]
  rendered?: boolean
}

let seq = 0
const nextId = (): string => `m${++seq}`

interface ChatState {
  messages: ChatMessage[]
  phase: ChatPhase
  /** 被锁拦截的尝试触发状态签脉冲（AI 处理中 → 红框提示） */
  blockedPulse: boolean
  /** 当前选中节点（上下文 chip + 用户指代；EditorView onActiveChange 时写入） */
  contextNode: { uid: string; text: string } | null
  pushUser: (text: string) => void
  appendStreamDelta: (text: string) => void
  finalizeStream: () => void
  pushCard: (c: ToolCardData) => void
  pushError: (text: string) => void
  setPhase: (p: ChatPhase) => void
  notifyBlocked: () => void
  setContextNode: (n: { uid: string; text: string } | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  phase: 'idle',
  blockedPulse: false,
  contextNode: null,
  pushUser: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: nextId(), role: 'user', text }, { id: nextId(), role: 'assistant', text: '' }],
    })),
  appendStreamDelta: (text) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === 'assistant') {
          msgs[i] = { ...msgs[i]!, text: msgs[i]!.text + text }
          break
        }
      }
      return { messages: msgs }
    }),
  finalizeStream: () =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === 'assistant') {
          msgs[i] = { ...msgs[i]!, rendered: true }
          break
        }
      }
      return { messages: msgs }
    }),
  pushCard: (c) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === 'assistant') {
          msgs[i] = { ...msgs[i]!, cards: [...(msgs[i]!.cards ?? []), c] }
          break
        }
      }
      return { messages: msgs }
    }),
  pushError: (text) => set((s) => ({ messages: [...s.messages, { id: nextId(), role: 'error', text }] })),
  setPhase: (p) => set({ phase: p }),
  notifyBlocked: () => {
    set({ blockedPulse: true })
    // 定时回调无抛错面；仍守"异步回调自己兜"惯例，出错也不静默
    try {
      window.setTimeout(() => {
        if (get().blockedPulse) set({ blockedPulse: false })
      }, 1600)
    } catch (e) {
      console.warn('AI 状态签脉冲复位失败', e)
    }
  },
  setContextNode: (n) => set({ contextNode: n }),
  reset: () => set({ messages: [], phase: 'idle', blockedPulse: false, contextNode: null }),
}))
