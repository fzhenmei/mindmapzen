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

// ═══ 操作卡动态收起（2026-09）：回合中明细卡达阈值即折成摘要行，不等回合收尾——
// 操作多时逐张明细把消息区越撑越长，回复尾部（流式光标）被顶出视口 ═══

test('pushCard 动态收起：第 5 张落下即折起，后续新卡只入列不展开', () => {
  const s = useChatStore.getState()
  s.pushUser('问')
  for (let i = 0; i < 5; i++) s.pushCard({ kind: 'add', ok: true, text: `op${i}` })
  let last = useChatStore.getState().messages.at(-1)!
  expect(last.cards).toHaveLength(5)
  expect(last.cardsCollapsed).toBe(true) // 恰达阈值：立即折成摘要行
  s.pushCard({ kind: 'add', ok: true, text: 'op5' })
  last = useChatStore.getState().messages.at(-1)!
  expect(last.cards).toHaveLength(6) // 计数照涨（数字即进度反馈）
  expect(last.cardsCollapsed).toBe(true) // 保持折起
})

test('pushCard 动态收起：不足阈值不折（4 张仍展开）', () => {
  const s = useChatStore.getState()
  s.pushUser('问')
  for (let i = 0; i < 4; i++) s.pushCard({ kind: 'add', ok: true, text: `op${i}` })
  expect(useChatStore.getState().messages.at(-1)!.cardsCollapsed).not.toBe(true)
})

test('pushCard 动态收起：恰达阈值只折一次——用户展开后，后续新卡不重抢', () => {
  const s = useChatStore.getState()
  s.pushUser('问')
  for (let i = 0; i < 5; i++) s.pushCard({ kind: 'add', ok: true, text: `op${i}` })
  const id = useChatStore.getState().messages.at(-1)!.id
  s.toggleCards(id) // 用户点开摘要看明细
  expect(useChatStore.getState().messages.at(-1)!.cardsCollapsed).toBe(false)
  s.pushCard({ kind: 'add', ok: true, text: 'op5' })
  // 不重抢：展开态保持到回合收尾（collapseLastCards 兜底），中途不强制折回
  expect(useChatStore.getState().messages.at(-1)!.cardsCollapsed).toBe(false)
})
