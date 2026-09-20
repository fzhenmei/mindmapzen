// 快速捕获运行时接线（spec §5.1/§5.3）：端口注入测——注册/注销/失败双出口/案头关窗拦截
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, test, expect, beforeEach, afterEach } from 'vitest'
import { useQuickCaptureRuntime, QUICK_CAPTURE_ACCELERATOR } from './useQuickCaptureRuntime'
import { useAppStore } from '../store/appStore'

const makePorts = () => ({
  registerShortcut: vi.fn().mockResolvedValue(undefined),
  unregisterShortcut: vi.fn().mockResolvedValue(undefined),
  isShortcutRegistered: vi.fn().mockResolvedValue(false),
  registerLibraryCloseGuard: vi.fn().mockResolvedValue(() => {}),
  closeMainWindow: vi.fn(),
  setTray: vi.fn().mockResolvedValue(undefined),
})

beforeEach(() => {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {} // 越过 Tauri 守卫
  useAppStore.setState({ quickCaptureEnabled: false, quickCaptureShortcutError: null, route: 'library' })
})
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

test('启用：注册快捷键（Win 键位 Ctrl+Alt+I）并清错误位；禁用：已注册才注销', async () => {
  expect(QUICK_CAPTURE_ACCELERATOR).toBe('Ctrl+Alt+I') // jsdom UA 非 mac
  const ports = makePorts()
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureEnabled: true })
  rerender()
  await waitFor(() => expect(ports.registerShortcut).toHaveBeenCalledWith('Ctrl+Alt+I', expect.any(Function)))
  expect(useAppStore.getState().quickCaptureShortcutError).toBeNull()
  ports.isShortcutRegistered.mockResolvedValue(true)
  useAppStore.setState({ quickCaptureEnabled: false })
  rerender()
  await waitFor(() => expect(ports.unregisterShortcut).toHaveBeenCalledWith('Ctrl+Alt+I'))
})

test('注册失败：错误位 + toast 双出口（spec §5.3，不静默降级）', async () => {
  const ports = makePorts()
  ports.registerShortcut.mockRejectedValue(new Error('occupied'))
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureEnabled: true })
  rerender()
  await waitFor(() => expect(useAppStore.getState().quickCaptureShortcutError).toContain('快捷键'))
})

test('案头路由：enabled 时拦截关窗（preventDefault + closeMainWindow）；编辑器路由摘除', async () => {
  const ports = makePorts()
  let captured: ((e: { preventDefault(): void }) => void) | undefined
  ports.registerLibraryCloseGuard.mockImplementation(async (cb) => { captured = cb; return () => {} })
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  await waitFor(() => expect(captured).toBeDefined()) // 案头路由：已注册
  useAppStore.setState({ route: 'editor' })
  rerender()
  ports.registerLibraryCloseGuard.mockClear()
  useAppStore.setState({ route: 'library' }) // 回案头 → 重新注册（effect 清理/重挂）
  rerender()
  await waitFor(() => expect(ports.registerLibraryCloseGuard).toHaveBeenCalledTimes(1))
  const prevent = vi.fn()
  useAppStore.setState({ quickCaptureEnabled: true })
  act(() => captured!({ preventDefault: prevent }))
  expect(prevent).toHaveBeenCalledTimes(1)
  expect(ports.closeMainWindow).toHaveBeenCalledTimes(1)
})

test('托盘联动：启用/禁用均调 setTray（actions 间接读 store，闭包安全）', async () => {
  const ports = makePorts()
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureEnabled: true })
  rerender()
  await waitFor(() => expect(ports.setTray).toHaveBeenCalledWith(true, expect.objectContaining({
    onShowMain: expect.any(Function),
    onNewIdea: expect.any(Function),
    onQuit: expect.any(Function),
  })))
  useAppStore.setState({ quickCaptureEnabled: false })
  rerender()
  await waitFor(() => expect(ports.setTray).toHaveBeenLastCalledWith(false, expect.any(Object)))
})
