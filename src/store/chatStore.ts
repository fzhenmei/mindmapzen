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
  /** 全局停止句柄（终审 I3）：回合中 ai-close 卸载面板再重开，新组件实例的 ref 归零，
   *  停止句柄若只存组件内则 no-op（孤儿回合失控）——挂 store 才能跨实例停掉进行中回合 */
  stopRequest: (() => void) | null
  pushUser: (text: string) => void
  appendStreamDelta: (text: string) => void
  finalizeStream: () => void
  pushCard: (c: ToolCardData) => void
  pushError: (text: string) => void
  setPhase: (p: ChatPhase) => void
  setStopRequest: (fn: (() => void) | null) => void
  notifyBlocked: () => void
  setContextNode: (n: { uid: string; text: string } | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  phase: 'idle',
  blockedPulse: false,
  contextNode: null,
  stopRequest: null,
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
  setStopRequest: (fn) => set({ stopRequest: fn }),
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
  // 切图本就回合禁用（reset 时无在途回合），stopRequest 一并清空防陈旧句柄悬挂
  reset: () => set({ messages: [], phase: 'idle', blockedPulse: false, contextNode: null, stopRequest: null }),
}))
