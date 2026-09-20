// 关窗隐藏（spec §5.1）：干净关闭 + hijack → preventClose 并走 exitApp（hide 语义）；
// 无 hijack 放行自然关闭；脏态优先于 hijack（三态框仍然兜底）
import { renderHook, act } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import { useCloseGuard } from './useCloseGuard'

function setup(hijack: boolean, dirty: boolean) {
  let handler: ((e: { preventClose(): void }) => void) | undefined
  const exitApp = vi.fn()
  const opts = {
    registerCloseGuard: (cb: (e: { preventClose(): void }) => void) => { handler = cb; return () => {} },
    exitApp,
    dirtyRef: { current: dirty },
    explicitSave: vi.fn().mockResolvedValue(true),
    clearDirty: vi.fn(),
    hijackCleanClose: () => hijack,
  }
  const { result } = renderHook(() => useCloseGuard(opts))
  // act 包裹（照 ai.test.ts 邻例）：脏态分支的 setGuarding 需在断言前 flush 到 result
  return { fire: (preventSpy = vi.fn()) => act(() => handler!({ preventClose: preventSpy })), exitApp, result }
}

test('干净 + hijack：preventClose 并走 exitApp（隐藏而非退出）', () => {
  const { fire, exitApp } = setup(true, false)
  const prevent = vi.fn()
  fire(prevent)
  expect(prevent).toHaveBeenCalledTimes(1)
  expect(exitApp).toHaveBeenCalledTimes(1)
})

test('干净 + 无 hijack：放行（不 preventClose、不 exitApp）', () => {
  const { fire, exitApp } = setup(false, false)
  const prevent = vi.fn()
  fire(prevent)
  expect(prevent).not.toHaveBeenCalled()
  expect(exitApp).not.toHaveBeenCalled()
})

test('脏态优先于 hijack：走三态框而非直接 exitApp', () => {
  const { fire, exitApp, result } = setup(true, true)
  const prevent = vi.fn()
  fire(prevent)
  expect(prevent).toHaveBeenCalledTimes(1)
  expect(exitApp).not.toHaveBeenCalled()
  expect(result.current.guarding).toBe(true)
})
