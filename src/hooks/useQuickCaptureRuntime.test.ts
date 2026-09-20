// 快速捕获运行时接线（spec §5.1/§5.3；2026-09 拆分为双开关）：端口注入测——
// 注册/注销/失败双出口/案头关窗拦截/快捷键与托盘正交联动
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
  listenBasketUpdated: vi.fn().mockResolvedValue(() => {}),
})

beforeEach(() => {
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {} // 越过 Tauri 守卫
  useAppStore.setState({ quickCaptureShortcut: false, quickCaptureTray: false, quickCaptureShortcutError: null, route: 'library' } as never)
})
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

test('启用快捷键：注册（Win 键位 Ctrl+Alt+I）并清错误位；禁用：已注册才注销', async () => {
  expect(QUICK_CAPTURE_ACCELERATOR).toBe('Ctrl+Alt+I') // jsdom UA 非 mac
  const ports = makePorts()
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureShortcut: true } as never)
  rerender()
  await waitFor(() => expect(ports.registerShortcut).toHaveBeenCalledWith('Ctrl+Alt+I', expect.any(Function)))
  expect(useAppStore.getState().quickCaptureShortcutError).toBeNull()
  ports.isShortcutRegistered.mockResolvedValue(true)
  useAppStore.setState({ quickCaptureShortcut: false } as never)
  rerender()
  await waitFor(() => expect(ports.unregisterShortcut).toHaveBeenCalledWith('Ctrl+Alt+I'))
})

test('注册失败：错误位 + toast 双出口（spec §5.3，不静默降级）', async () => {
  const ports = makePorts()
  ports.registerShortcut.mockRejectedValue(new Error('occupied'))
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureShortcut: true } as never)
  rerender()
  await waitFor(() => expect(useAppStore.getState().quickCaptureShortcutError).toContain('快捷键'))
})

test('拆分正交（2026-09）：只开快捷键 → 注册快捷键 + 托盘保持关；只开托盘 → 托盘开 + 快捷键不注册', async () => {
  const ports = makePorts()
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureShortcut: true } as never)
  rerender()
  await waitFor(() => expect(ports.registerShortcut).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(ports.setTray).toHaveBeenLastCalledWith(false, expect.any(Object)))
  expect(ports.unregisterShortcut).not.toHaveBeenCalled() // 快捷键开着，无注销
  ports.isShortcutRegistered.mockResolvedValue(true) // 关快捷键路径的已注册探测（须先于 rerender——effect 的异步体在触发拍即消费）
  useAppStore.setState({ quickCaptureShortcut: false, quickCaptureTray: true } as never)
  rerender()
  await waitFor(() => expect(ports.setTray).toHaveBeenLastCalledWith(true, expect.objectContaining({
    onShowMain: expect.any(Function),
    onNewIdea: expect.any(Function),
    onQuit: expect.any(Function),
  })))
  await waitFor(() => expect(ports.unregisterShortcut).toHaveBeenCalledWith('Ctrl+Alt+I'))
  expect(ports.registerShortcut).toHaveBeenCalledTimes(1) // 托盘开关不触发快捷键注册
})

test('案头路由：tray 开时拦截关窗（preventDefault + closeMainWindow）；编辑器路由摘除', async () => {
  const ports = makePorts()
  let captured: ((e: { preventDefault(): void }) => void) | undefined
  ports.registerLibraryCloseGuard.mockImplementation(async (cb) => { captured = cb; return () => {} })
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  await waitFor(() => expect(captured).toBeDefined()) // 案头路由：已注册
  useAppStore.setState({ route: 'editor' } as never)
  rerender()
  ports.registerLibraryCloseGuard.mockClear()
  useAppStore.setState({ route: 'library' } as never) // 回案头 → 重新注册（effect 清理/重挂）
  rerender()
  await waitFor(() => expect(ports.registerLibraryCloseGuard).toHaveBeenCalledTimes(1))
  const prevent = vi.fn()
  useAppStore.setState({ quickCaptureTray: true } as never) // 关窗隐藏跟托盘走（拆分裁定）
  act(() => captured!({ preventDefault: prevent }))
  expect(prevent).toHaveBeenCalledTimes(1)
  expect(ports.closeMainWindow).toHaveBeenCalledTimes(1)
})

test('托盘联动：启用/禁用均调 setTray（actions 间接读 store，闭包安全）', async () => {
  const ports = makePorts()
  const { rerender } = renderHook(() => useQuickCaptureRuntime(ports))
  useAppStore.setState({ quickCaptureTray: true } as never)
  rerender()
  await waitFor(() => expect(ports.setTray).toHaveBeenCalledWith(true, expect.objectContaining({
    onShowMain: expect.any(Function),
    onNewIdea: expect.any(Function),
    onQuit: expect.any(Function),
  })))
  useAppStore.setState({ quickCaptureTray: false } as never)
  rerender()
  await waitFor(() => expect(ports.setTray).toHaveBeenLastCalledWith(false, expect.any(Object)))
})

test('跨窗同步：篮子图干净 → editorSeq 递增（重挂重载）；脏 → toast', async () => {
  let cb: ((mapPath: string) => void) | undefined
  const ports = makePorts()
  ports.listenBasketUpdated.mockImplementation(async (f) => { cb = f; return () => {} })
  renderHook(() => useQuickCaptureRuntime(ports))
  await waitFor(() => expect(cb).toBeDefined())
  useAppStore.setState({ route: 'editor', currentMdPath: '/ws/b.md', dirty: false } as never)
  const seq0 = useAppStore.getState().editorSeq
  act(() => cb!('/ws/b.md'))
  expect(useAppStore.getState().editorSeq).toBe(seq0 + 1)
  useAppStore.setState({ dirty: true } as never)
  act(() => cb!('/ws/b.md'))
  expect(useAppStore.getState().editorSeq).toBe(seq0 + 1) // notify 不重载
})
