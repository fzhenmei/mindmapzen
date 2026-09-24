// src/store/chatStore.ts —— AI 对话 UI 状态（spec §7）：纯状态仓，回合编排在 ChatPanel
// （agentLoop 是纯函数经回调写这里）。会话 v1 内存态：切导图 reset（回合期间本就禁切换）。
import { create } from 'zustand'

export type ChatPhase = 'idle' | 'streaming' | 'executing'

/** 卡片滚动窗口大小（2026-09 有界队列）：回合中操作明细恒显最新 CARDS_WINDOW 条，
 *  更早的折进摘要行——操作多时消息区不再被逐张明细越撑越长，回复尾部（流式光标）
 *  始终留在视口内。窗口由渲染层推导（ChatPanel AssistantRow），store 只持翻转位；
 *  回合收尾 collapseLastCards 仍全折（「共 N 项」摘要） */
export const CARDS_WINDOW = 5

export interface ToolCardData {
  kind: 'add' | 'update' | 'remove' | 'move' | 'body' | 'icon' | 'tag' | 'expand' | 'layout' | 'link' | 'unlink'
  ok: boolean
  text: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error' | 'notice'
  text: string
  cards?: ToolCardData[]
  rendered?: boolean
  /** 操作卡片收起态（2026-09）：undefined/false = 展开明细卡；回合收尾由 collapseLastCards
   *  自动置 true（操作步骤完成即收，想看自己展开），摘要行点击经 toggleCards 切换 */
  cardsCollapsed?: boolean
  /** 卡片窗口展开位（2026-09 滚动窗口）：undefined/true = 窗口态（恒显最新 CARDS_WINDOW
   *  条，较早的折进摘要）；false = 用户点开过全部。仅 cards.length > CARDS_WINDOW 且
   *  未全折时有意义——pushCard 纯追加不写此键（窗口由渲染层推导，新卡不与用户抢状态） */
  cardsWindowed?: boolean
}

/** 待载入历史条目（2026-09 持久化）：chatHistory 服务的存储投影（结构同 PersistedChatMessage，
 *  结构型兼容免反向 import） */
export interface PendingChatMessage {
  role: 'user' | 'assistant'
  text: string
  cards?: ToolCardData[]
}

let seq = 0
const nextId = (): string => `m${++seq}`

interface ChatState {
  messages: ChatMessage[]
  phase: ChatPhase
  /** 待载入对话历史（2026-09 持久化）：打开导图读到非空流水时挂此（EditorView 异读灌入）；
   *  null = 无历史或已处置。载入/重新开始/首条消息发送（pushUser）任一即清——发送即
   *  隐式「重新开始」：新会话不回传旧上下文，文件流水照常追加（历史不丢） */
  pendingHistory: PendingChatMessage[] | null
  /** 被锁拦截的尝试触发状态签脉冲（AI 处理中 → 红框提示） */
  blockedPulse: boolean
  /** 当前选中节点（上下文 chip + 用户指代；EditorView onActiveChange 时写入） */
  contextNode: { uid: string; text: string } | null
  /** 全局停止句柄（终审 I3）：回合中 ai-close 卸载面板再重开，新组件实例的 ref 归零，
   *  停止句柄若只存组件内则 no-op（孤儿回合失控）——挂 store 才能跨实例停掉进行中回合 */
  stopRequest: (() => void) | null
  setPendingHistory: (msgs: PendingChatMessage[]) => void
  /** 载入历史：灌入 messages（id 重排、assistant 定稿态、卡片收起），清待载入 */
  loadPendingHistory: () => void
  /** 重新开始：仅弃待载入（消息区保持现状），新对话不带历史 */
  dismissPendingHistory: () => void
  pushUser: (text: string) => void
  appendStreamDelta: (text: string) => void
  finalizeStream: () => void
  /** 把最后一条 assistant 退回流式分支（rendered=false）——工具轮 round-2 streaming 时
   *  调用（终审 M3/Ruling 7）：delta 继续走纯文本+光标追加，不再每 delta 一次全量
   *  lute 重渲染（亦是 I1 渲染竞态的生产暴露路径），定稿再挂 md */
  unrenderLastAssistant: () => void
  pushCard: (c: ToolCardData) => void
  /** 回合收尾把最后一条 assistant 的操作卡片收起（仅标记收起态，明细数据不动）——
   *  在 handleSend 的 finally 调用，整回合恰好一次（多工具轮之间不闪收） */
  collapseLastCards: () => void
  /** 摘要行点击切换某条消息的卡片展开/收起（用户自主查看） */
  toggleCards: (id: string) => void
  pushError: (text: string) => void
  /** 系统提示信息卡（v1.1 ②：无安全网告知等中性提示）——不进对话历史回传（AI 上下文
   *  只取 user/assistant，历史过滤器天然排除），仅 UI 留存 */
  pushNotice: (text: string) => void
  setPhase: (p: ChatPhase) => void
  setStopRequest: (fn: (() => void) | null) => void
  notifyBlocked: () => void
  setContextNode: (n: { uid: string; text: string } | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  phase: 'idle',
  pendingHistory: null,
  blockedPulse: false,
  contextNode: null,
  stopRequest: null,
  setPendingHistory: (msgs) => set({ pendingHistory: msgs }),
  loadPendingHistory: () =>
    set((s) => {
      if (s.pendingHistory === null || s.pendingHistory.length === 0) return { pendingHistory: null }
      const loaded: ChatMessage[] = s.pendingHistory.map((m) => ({
        id: nextId(),
        role: m.role,
        text: m.text,
        // assistant 补定稿态（载入的历史必是完整回合）；卡片统一收起，想看自己展开
        rendered: m.role === 'assistant' ? true : undefined,
        cards: m.cards,
        cardsCollapsed: m.cards !== undefined && m.cards.length > 0 ? true : undefined,
      }))
      return { messages: [...s.messages, ...loaded], pendingHistory: null }
    }),
  dismissPendingHistory: () => set({ pendingHistory: null }),
  pushUser: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: nextId(), role: 'user', text }, { id: nextId(), role: 'assistant', text: '' }],
      pendingHistory: null, // 发送即隐式「重新开始」：banner 场景下不再提醒
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
  // M3：仅 rendered=true 时克隆置回（已流式态幂等，不白拷消息数组扰动订阅）
  unrenderLastAssistant: () =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === 'assistant') {
          if (msgs[i]!.rendered) msgs[i] = { ...msgs[i]!, rendered: false }
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
  // 幂等（同 unrenderLastAssistant 先例）：已收起不克隆，不白拷消息数组扰动订阅
  collapseLastCards: () =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === 'assistant') {
          if ((msgs[i]!.cards?.length ?? 0) > 0 && !msgs[i]!.cardsCollapsed) {
            msgs[i] = { ...msgs[i]!, cardsCollapsed: true }
          }
          break
        }
      }
      return { messages: msgs }
    }),
  /** 摘要行点击按形态分派（2026-09 滚动窗口）：全折态 → 全展开（collapsed=false 且
   *  windowed=false，展开意图是全部）；窗口态（>CARDS_WINDOW 条未全折）→ 翻转
   *  windowed（全展开 ↔ 窗口）；≤窗口条数无旧组 → 现行全折/全展互切 */
  toggleCards: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== id || (m.cards?.length ?? 0) === 0) return m
        if (m.cardsCollapsed) return { ...m, cardsCollapsed: false, cardsWindowed: false }
        if ((m.cards?.length ?? 0) > CARDS_WINDOW) return { ...m, cardsWindowed: m.cardsWindowed === false }
        return { ...m, cardsCollapsed: true }
      }),
    })),
  pushError: (text) => set((s) => ({ messages: [...s.messages, { id: nextId(), role: 'error', text }] })),
  pushNotice: (text) => set((s) => ({ messages: [...s.messages, { id: nextId(), role: 'notice', text }] })),
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
  reset: () => set({ messages: [], phase: 'idle', blockedPulse: false, contextNode: null, stopRequest: null, pendingHistory: null }),
}))
