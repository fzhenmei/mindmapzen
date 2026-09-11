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
