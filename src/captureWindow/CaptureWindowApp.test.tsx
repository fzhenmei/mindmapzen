// 捕获小窗组件（spec §5.4/§5.5）：端口注入测——无工作区态 / 成功 emit+隐藏 / 失败保留
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { test, expect, beforeEach } from 'vitest'
import CaptureWindowApp, { type CaptureWindowPorts } from './CaptureWindowApp'
import { useAppStore } from '../store/appStore'
import { basketAbsPath } from '../services/basket'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

const makePorts = (): CaptureWindowPorts & { calls: { hide: number; emit: string[]; showMain: number; showSelf: number } } => {
  const s = { hide: 0, emit: [] as string[], showMain: 0, showSelf: 0 }
  return {
    calls: s,
    hide: () => { s.hide += 1 },
    emitBasketUpdated: async (mapPath) => { s.emit.push(mapPath) },
    showMainWindow: async () => { s.showMain += 1 },
    showSelf: async () => { s.showSelf += 1 },
    onFocusChanged: async () => () => {},
  }
}

beforeEach(() => {
  // Ruling P-1（内存 fs 桩路径）：loadConfig 内置宽容回退永不抛——jsdom 下 store.adapter 为
  // null 时返回 DEFAULT_CONFIG（workspaceDir:null），refresh 成功分支会清掉测内落定的工作区，
  // brief 注记的 catch「维持现值」分支不可达。装自镜桩（读时回望 store 现值作 cfg）让 refresh
  // 的 loadConfig→parse→setState 全链路真实走通且"确认现值"，三条用例据此成立
  const fs = new MemoryFsAdapter()
  fs.readTextFile = async () =>
    JSON.stringify({ workspaceDir: useAppStore.getState().workspaceDir, basketPath: useAppStore.getState().basketRelPath })
  useAppStore.setState({ adapter: fs, configPath: '/cfg.json', workspaceDir: null, basketRelPath: null, resolvedLanguage: 'zh-CN' })
})

test('无工作区：提示 + 打开主窗口按钮（spec §5.4），就绪后同样自显', async () => {
  useAppStore.setState({ captureIdea: async () => ({ ok: true }) })
  const ports = makePorts()
  render(<CaptureWindowApp ports={ports} />)
  const btn = await screen.findByTestId('capture-nows')
  expect(btn).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '打开主窗口' }))
  await waitFor(() => expect(ports.calls.showMain).toBe(1))
  await waitFor(() => expect(ports.calls.showSelf).toBeGreaterThanOrEqual(1))
})

test('就绪自显：配置落定 + 首帧绘制后调 showSelf（防首唤白闪，隐身创建）', async () => {
  useAppStore.setState({ workspaceDir: '/ws', basketRelPath: '点子篮子.md' })
  const ports = makePorts()
  render(<CaptureWindowApp ports={ports} />)
  await screen.findByTestId('capture-input')
  await waitFor(() => expect(ports.calls.showSelf).toBeGreaterThanOrEqual(1))
})

test('提交成功：emit basket-updated（篮子绝对路径）并隐藏（spec §5.5）', async () => {
  useAppStore.setState({ workspaceDir: '/ws', basketRelPath: '点子篮子.md', captureIdea: async () => ({ ok: true }) })
  const ports = makePorts()
  render(<CaptureWindowApp ports={ports} />)
  await screen.findByTestId('capture-input')
  fireEvent.change(screen.getByTestId('capture-input'), { target: { value: '灵光' } })
  fireEvent.keyDown(screen.getByTestId('capture-input'), { key: 'Enter' })
  await waitFor(() => expect(ports.calls.emit).toEqual([basketAbsPath('/ws', '点子篮子.md')]))
  expect(ports.calls.hide).toBe(1)
})

test('提交失败：错误显示且不隐藏、内容保留（spec §7.2）', async () => {
  useAppStore.setState({ workspaceDir: '/ws', basketRelPath: '点子篮子.md', captureIdea: async () => ({ ok: false, error: '写入失败' }) })
  const ports = makePorts()
  render(<CaptureWindowApp ports={ports} />)
  await screen.findByTestId('capture-input')
  fireEvent.change(screen.getByTestId('capture-input'), { target: { value: '灵光' } })
  fireEvent.keyDown(screen.getByTestId('capture-input'), { key: 'Enter' })
  await waitFor(() => expect(screen.getByTestId('capture-error')).toBeVisible())
  expect(ports.calls.hide).toBe(0)
  expect(ports.calls.emit).toEqual([])
})

test('窗口获得系统焦点后聚焦输入框（2026-09-23 回归：隐身创建期 mount 时 focus 不生效，呼出后须手动点击）', async () => {
  useAppStore.setState({ workspaceDir: '/ws', basketRelPath: '点子篮子.md' })
  let fireFocus: ((focused: boolean) => void) | undefined
  const ports = makePorts()
  ports.onFocusChanged = async (cb) => { fireFocus = cb; return () => {} }
  render(<CaptureWindowApp ports={ports} />)
  await screen.findByTestId('capture-input')
  // mount 期（窗口隐身/无焦点）不聚焦——聚焦必须等 WebView2 拿到系统焦点之后
  expect(document.activeElement).not.toBe(screen.getByTestId('capture-input'))
  // 首次自显链：showSelf → setFocus → 系统焦点事件驱动输入框聚焦
  fireFocus?.(true)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('capture-input')))
  // 失焦隐藏（草稿保留，组件不卸载）后再唤起：焦点事件再次驱动聚焦
  fireFocus?.(false)
  ;(document.activeElement as HTMLElement).blur()
  fireFocus?.(true)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('capture-input')))
})
