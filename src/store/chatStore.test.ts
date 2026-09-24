// src/store/chatStore.test.ts —— 对话状态机（Task 9）
import { beforeEach, expect, test, vi } from 'vitest'
import { useChatStore } from './chatStore'

beforeEach(() => {
  vi.useFakeTimers()
  useChatStore.getState().reset()
})

test('pushUser 开 assistant 占位，delta 累积，finalize 置 rendered', () => {
  const s = useChatStore.getState()
  s.pushUser('你好')
  s.appendStreamDelta('在')
  s.appendStreamDelta('的')
  s.finalizeStream()
  const msgs = useChatStore.getState().messages
  expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
  expect(msgs[1]!.text).toBe('在的')
  expect(msgs[1]!.rendered).toBe(true)
})

test('pushCard 挂到最后一条 assistant；pushError 独立错误消息', () => {
  const s = useChatStore.getState()
  s.pushUser('加个节点')
  s.appendStreamDelta('好')
  s.pushCard({ kind: 'add', ok: true, text: '新要点' })
  s.pushError('连接中断')
  const msgs = useChatStore.getState().messages
  expect(msgs[1]!.cards).toEqual([{ kind: 'add', ok: true, text: '新要点' }])
  expect(msgs[2]).toMatchObject({ role: 'error', text: '连接中断' })
})

test('notifyBlocked 脉冲 1.6s 自动回落', () => {
  useChatStore.getState().notifyBlocked()
  expect(useChatStore.getState().blockedPulse).toBe(true)
  vi.advanceTimersByTime(1700)
  expect(useChatStore.getState().blockedPulse).toBe(false)
})

test('unrenderLastAssistant：定稿退回流式分支，重复调用幂等，无 assistant 时安全 no-op', () => {
  const s = useChatStore.getState()
  s.pushUser('x')
  s.finalizeStream() // round-1 工具轮定稿：rendered=true（挂 md）
  expect(useChatStore.getState().messages[1]!.rendered).toBe(true)
  useChatStore.getState().unrenderLastAssistant() // round-2 streaming：退回纯文本+光标
  expect(useChatStore.getState().messages[1]!.rendered).toBe(false)
  useChatStore.getState().unrenderLastAssistant() // 已流式态再调不炸、值不变
  expect(useChatStore.getState().messages[1]!.rendered).toBe(false)
  useChatStore.getState().reset()
  useChatStore.getState().unrenderLastAssistant() // 空消息表：无 assistant 可退，no-op
  expect(useChatStore.getState().messages).toEqual([])
})

test('setStopRequest：全局停止句柄可调可摘，reset 清空防陈旧悬挂（终审 I3）', () => {
  let stopped = false
  useChatStore.getState().setStopRequest(() => {
    stopped = true
  })
  useChatStore.getState().stopRequest?.()
  expect(stopped).toBe(true)
  useChatStore.getState().setStopRequest(null)
  expect(useChatStore.getState().stopRequest).toBeNull()
  useChatStore.getState().setStopRequest(() => {})
  useChatStore.getState().reset()
  expect(useChatStore.getState().stopRequest).toBeNull()
})

test('reset 清空', () => {
  useChatStore.getState().pushUser('x')
  useChatStore.getState().reset()
  expect(useChatStore.getState().messages).toEqual([])
  expect(useChatStore.getState().phase).toBe('idle')
})

// ═══ 操作卡滚动窗口（2026-09 有界队列）：回合中恒显最新 5 条，更早的折进摘要——
// 窗口由渲染层推导（AssistantRow），pushCard 纯追加，store 只持 toggleCards 翻转位 ═══

test('pushCard 纯追加：不写任何折叠/窗口键（滚动窗口由渲染层推导）', () => {
  const s = useChatStore.getState()
  s.pushUser('问')
  for (let i = 0; i < 8; i++) s.pushCard({ kind: 'add', ok: true, text: `op${i}` })
  const last = useChatStore.getState().messages.at(-1)!
  expect(last.cards).toHaveLength(8)
  expect(last.cardsCollapsed).toBeUndefined() // undefined=从未折叠既有契约保持
  expect(last.cardsWindowed).toBeUndefined()
})

test('toggleCards 三态分派：>5 条窗口态 ↔ 全展开互切；≤5 条现行全折', () => {
  const s = useChatStore.getState()
  s.pushUser('问')
  for (let i = 0; i < 8; i++) s.pushCard({ kind: 'add', ok: true, text: `op${i}` })
  const id = useChatStore.getState().messages.at(-1)!.id
  s.toggleCards(id) // 窗口态 → 全展开
  expect(useChatStore.getState().messages.at(-1)!.cardsWindowed).toBe(false)
  s.toggleCards(id) // 全展开 → 折回窗口
  expect(useChatStore.getState().messages.at(-1)!.cardsWindowed).toBe(true)
  // ≤5 条无窗口：现行行为——展开态点摘要全折
  s.pushUser('少')
  for (let i = 0; i < 2; i++) useChatStore.getState().pushCard({ kind: 'add', ok: true, text: `x${i}` })
  useChatStore.getState().toggleCards(useChatStore.getState().messages.at(-1)!.id)
  expect(useChatStore.getState().messages.at(-1)!.cardsCollapsed).toBe(true)
})

test('toggleCards 三态分派：全折态点摘要 → 全展开（collapsed=false 且 windowed=false）', () => {
  const s = useChatStore.getState()
  s.pushUser('问')
  for (let i = 0; i < 8; i++) s.pushCard({ kind: 'add', ok: true, text: `op${i}` })
  s.collapseLastCards() // 回合收尾全折
  useChatStore.getState().toggleCards(useChatStore.getState().messages.at(-1)!.id)
  const m = useChatStore.getState().messages.at(-1)!
  expect(m.cardsCollapsed).toBe(false)
  expect(m.cardsWindowed).toBe(false) // 展开意图=全部，不是回窗口
})

// ═══ 待载入对话历史（2026-09 持久化）：打开导图读到非空流水挂此，载入/重新开始/
// 首条消息发送任一即清——发送即隐式「重新开始」（新会话不回传旧上下文） ═══

test('loadPendingHistory：灌入重排 id、assistant 定稿态、卡片收起；清待载入', () => {
  const s = useChatStore.getState()
  s.pushUser('本会话已有') // id m1/m2——载入须从其后排起，不与既有 id 撞车
  s.setPendingHistory([
    { role: 'user', text: '旧问' },
    { role: 'assistant', text: '旧答', cards: [{ kind: 'add', ok: true, text: '新节点' }] },
  ])
  s.loadPendingHistory()
  const msgs = useChatStore.getState().messages
  expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  // 重排 id：与既有 id 不撞车且互不相同（seq 模块级跨用例递增，断言相对性）
  const ids = msgs.map((m) => m.id)
  expect(new Set(ids).size).toBe(4)
  expect(ids.slice(2)).not.toContain(ids[0])
  expect(msgs[3]).toMatchObject({ text: '旧答', rendered: true, cardsCollapsed: true })
  expect(msgs[2]).toMatchObject({ text: '旧问' }) // user 无 rendered 键
  expect(useChatStore.getState().pendingHistory).toBeNull()
})

test('clearSession：清空当前会话消息，不动待载入（重开钮串联 reload 接棒 banner 回归）', () => {
  const s = useChatStore.getState()
  s.pushUser('x')
  s.setPendingHistory([{ role: 'user', text: '旧' }])
  s.clearSession()
  expect(useChatStore.getState().messages).toEqual([]) // 只管消息区
  expect(useChatStore.getState().pendingHistory).toEqual([{ role: 'user', text: '旧' }]) // pending 归 reload 管
})

test('pushUser 清 pendingHistory（发送即隐式重新开始）；reset 一并清', () => {
  const s = useChatStore.getState()
  s.setPendingHistory([{ role: 'user', text: '旧' }])
  s.pushUser('新话题')
  expect(useChatStore.getState().pendingHistory).toBeNull()
  s.setPendingHistory([{ role: 'user', text: '旧' }])
  useChatStore.getState().reset()
  expect(useChatStore.getState().pendingHistory).toBeNull()
})

test('loadPendingHistory 空态安全：无待载入时 no-op', () => {
  useChatStore.getState().loadPendingHistory()
  expect(useChatStore.getState().messages).toEqual([])
})
