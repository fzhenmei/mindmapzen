// src/hooks/useCloseGuard.ai.test.ts —— blockClose 注入（Task 12）
import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useCloseGuard } from './useCloseGuard'

const baseOpts = {
  registerCloseGuard: (cb: (e: { preventClose(): void }) => void) => {
    ;(globalThis as { __capturedGuard?: unknown }).__capturedGuard = cb
    return () => {}
  },
  exitApp: () => {},
  dirtyRef: { current: false },
  explicitSave: () => Promise.resolve(true),
  clearDirty: () => {},
}

test('blockClose=true：preventClose 且回调，不弹三态', () => {
  const onBlocked = vi.fn()
  const preventClose = vi.fn()
  renderHook(() => useCloseGuard({ ...baseOpts, blockClose: () => true, onBlocked }))
  const guard = (globalThis as { __capturedGuard?: (e: { preventClose(): void }) => void }).__capturedGuard!
  act(() => guard({ preventClose }))
  expect(preventClose).toHaveBeenCalledOnce()
  expect(onBlocked).toHaveBeenCalledOnce()
})

test('blockClose=false：干净图放行（原语义）', () => {
  const onBlocked = vi.fn()
  const preventClose = vi.fn()
  renderHook(() => useCloseGuard({ ...baseOpts, blockClose: () => false, onBlocked }))
  const guard = (globalThis as { __capturedGuard?: (e: { preventClose(): void }) => void }).__capturedGuard!
  act(() => guard({ preventClose }))
  expect(preventClose).not.toHaveBeenCalled()
})
