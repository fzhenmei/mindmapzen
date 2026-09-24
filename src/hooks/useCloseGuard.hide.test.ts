// 关窗语义（spec §5.1；2026-09-24 僵尸进程报障修正）：干净关闭一律接管——
// preventClose + exitApp（裁决在 appClose：托盘开 → hide 驻留；关 → 销毁捕获窗+主窗）。
// 不允许放行自然关闭：自然关闭只销毁主窗，隐藏复用的捕获窗驻留进程成僵尸；
// 脏态优先于接管（三态框仍然兜底）
import { renderHook, act } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import { useCloseGuard } from './useCloseGuard'

function setup(dirty: boolean) {
  let handler: ((e: { preventClose(): void }) => void) | undefined
  const exitApp = vi.fn()
  const opts = {
    registerCloseGuard: (cb: (e: { preventClose(): void }) => void) => { handler = cb; return () => {} },
    exitApp,
    dirtyRef: { current: dirty },
    explicitSave: vi.fn().mockResolvedValue(true),
    clearDirty: vi.fn(),
  }
  const { result } = renderHook(() => useCloseGuard(opts))
  // act 包裹（照 ai.test.ts 邻例）：脏态分支的 setGuarding 需在断言前 flush 到 result
  return { fire: (preventSpy = vi.fn()) => act(() => handler!({ preventClose: preventSpy })), exitApp, result }
}

test('干净关闭：恒 preventClose 并走 exitApp（appClose 裁决，不放行自然关闭）', () => {
  const { fire, exitApp } = setup(false)
  const prevent = vi.fn()
  fire(prevent)
  expect(prevent).toHaveBeenCalledTimes(1)
  expect(exitApp).toHaveBeenCalledTimes(1)
})

test('脏态：走三态框而非直接 exitApp', () => {
  const { fire, exitApp, result } = setup(true)
  const prevent = vi.fn()
  fire(prevent)
  expect(prevent).toHaveBeenCalledTimes(1)
  expect(exitApp).not.toHaveBeenCalled()
  expect(result.current.guarding).toBe(true)
})
