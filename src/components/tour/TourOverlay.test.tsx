import { describe, expect, test, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useAppStore } from '../../store/appStore'
import TourOverlay from './TourOverlay'
import { TOUR_STEPS } from './tourSteps'
import { MemoryFsAdapter } from '../../services/fs/MemoryFsAdapter'

beforeEach(() => {
  cleanup()
  // finishTour 会 load/save 配置：默认 adapter 为 null（生产 main.tsx 注入），
  // 按仓库惯例（SettingsDialog.test.tsx）注入内存桩 + 指定配置路径，避免 unhandled rejection
  useAppStore.getState().setAdapter(new MemoryFsAdapter())
  useAppStore.setState({ tourActive: false, tourStep: 0, route: 'library', currentMdPath: null, configPath: '/cfg.json' })
})

describe('TourOverlay', () => {
  test('未激活时不渲染', () => {
    const { container } = render(<TourOverlay />)
    expect(container).toBeEmptyDOMElement()
  })
  test('激活：无锚点步渲染居中卡 + 步数指示 + 下一步', () => {
    useAppStore.setState({ tourActive: true, tourStep: 0 })
    render(<TourOverlay />)
    expect(screen.getByTestId('tour-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
    expect(screen.getByTestId('tour-step-indicator').textContent).toBe('1 / 11')
    expect(screen.getByTestId('tour-next')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-prev')).not.toBeInTheDocument() // 首步无上一步
  })
  test('锚点步：目标存在渲染高亮框；window resize 重算不崩溃', () => {
    const el = document.createElement('div')
    el.setAttribute('data-testid', 'btn-new')
    document.body.appendChild(el)
    useAppStore.setState({ tourActive: true, tourStep: 1 }) // btn-new 步
    render(<TourOverlay />)
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument()
    fireEvent(window, new Event('resize'))
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument()
    el.remove()
  })
  test('锚点缺失降级居中卡（spec §4.3 不断链）', () => {
    useAppStore.setState({ tourActive: true, tourStep: 1 }) // btn-new 不在 DOM
    render(<TourOverlay />)
    expect(screen.queryByTestId('tour-highlight')).not.toBeInTheDocument()
    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
  })
  test('锚点延迟挂载：有界重试找到后从降级升级为高亮（跨视图异步渲染）', async () => {
    useAppStore.setState({ tourActive: true, tourStep: 1 }) // btn-new 步
    render(<TourOverlay />)
    expect(screen.queryByTestId('tour-highlight')).not.toBeInTheDocument() // 暂缺时先降级
    const el = document.createElement('div')
    el.setAttribute('data-testid', 'btn-new')
    document.body.appendChild(el) // 模拟编辑器文档加载链完成后锚点异步挂载
    await waitFor(() => expect(screen.getByTestId('tour-highlight')).toBeInTheDocument())
    el.remove()
  })
  test('推进：下一步步进、上一步回退、末步「完成」点击即 finish（spec §3.3 完成路径）', async () => {
    useAppStore.setState({ tourActive: true, tourStep: 0 })
    render(<TourOverlay />)
    fireEvent.click(screen.getByTestId('tour-next'))
    await waitFor(() => expect(useAppStore.getState().tourStep).toBe(1))
    // 上一步回退（首步外可见）
    fireEvent.click(screen.getByTestId('tour-prev'))
    await waitFor(() => expect(useAppStore.getState().tourStep).toBe(0))
    // 末步：按钮文案「完成」，点击关闭引导（跳过=完成同路径）
    useAppStore.getState().setTourStep(TOUR_STEPS.length - 1)
    await waitFor(() => expect(screen.getByTestId('tour-next').textContent).toBe('完成'))
    fireEvent.click(screen.getByTestId('tour-next'))
    await waitFor(() => expect(useAppStore.getState().tourActive).toBe(false))
  })
  test('上一步跨视图回退案头：route 回 library 高亮链恢复', async () => {
    // step 6（editor 段首步）：模拟 before 已跑完的跨视图状态（route=editor）
    useAppStore.setState({ tourActive: true, tourStep: 6, route: 'editor', workspaceDir: null })
    render(<TourOverlay />)
    fireEvent.click(screen.getByTestId('tour-prev'))
    await waitFor(() => expect(useAppStore.getState().tourStep).toBe(5))
    expect(useAppStore.getState().route).toBe('library') // 不回案头则 library 段锚点全失效
  })
  test('跳过即完成：finishTour 关闭并置 tourDone', async () => {
    useAppStore.setState({ tourActive: true, tourStep: 2 })
    render(<TourOverlay />)
    fireEvent.click(screen.getByTestId('tour-skip'))
    await waitFor(() => expect(useAppStore.getState().tourActive).toBe(false))
    expect(useAppStore.getState().tourDone).toBe(true)
  })
  test('Esc 触发跳过', async () => {
    useAppStore.setState({ tourActive: true, tourStep: 0 })
    render(<TourOverlay />)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(useAppStore.getState().tourActive).toBe(false))
  })
})
