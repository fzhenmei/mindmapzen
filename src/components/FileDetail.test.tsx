import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FileDetail from './FileDetail'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { MapInfo } from '../types/files'

const info: MapInfo = {
  name: '周计划',
  mdPath: '/ws/周计划.md',
  relDir: 'docs',
  modifiedAt: Date.now(),
  createdAt: Date.now(),
  size: 120,
}

// 案头详情态预览面板（容器合并改版）：本组件只剩「读文件 + markdown 渲染 + 兜底」；
// 卡头动作钮（含复制路径）已上移 LibraryView 页首，其行为归 LibraryView.test 覆盖
describe('FileDetail', () => {
  beforeEach(async () => {
    useAppStore.setState({ adapter: new MemoryFsAdapter(), workspaceDir: '/ws' })
    await useAppStore.getState().adapter.writeTextFileAtomic('/ws/周计划.md', '# 周计划\n')
  })
  afterEach(cleanup)

  test('渲染选中 md 的真实预览', async () => {
    render(<FileDetail info={info} />)
    expect(await screen.findByTestId('md-preview')).toHaveTextContent('周计划')
  })

  test('读取失败显示「无法预览」兜底', async () => {
    render(<FileDetail info={{ ...info, mdPath: '/ws/不存在.md' }} />)
    expect(await screen.findByText('无法预览')).toBeInTheDocument()
  })
})

/** 可控 ResizeObserver 桩：observe 即按规范同步首回调指定宽度（覆盖 setup.ts 空桩） */
const stubViewport = (width: number): void => {
  class StubRO {
    constructor(private readonly cb: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.cb(
        [{ target, contentRect: { width } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubRO)
}

// 大纲面板（2026-09）：响应式默认（auto 跟随主区宽 ≥900px）+ 三态偏好覆盖 +
// 条目点击滚动定位（锚点由 MarkdownPreview 按同源序号注入）
describe('FileDetail 大纲面板', () => {
  beforeEach(async () => {
    useAppStore.setState({ previewOutline: 'auto' })
    await useAppStore.getState().adapter.writeTextFileAtomic('/ws/周计划.md', '# 周计划\n## 上午\n## 下午\n')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('auto 且主区宽 ≥900：默认显示大纲（条目 + 正文锚点同源对齐）', async () => {
    stubViewport(950)
    render(<FileDetail info={info} />)
    expect(await screen.findByTestId('outline-panel')).toBeInTheDocument()
    expect(screen.getByTestId('outline-zen-h-1')).toHaveTextContent('上午')
    // 正文标题锚点：第 2 个标题（h2 上午）id = zen-h-1（与大纲条目同源；
    // 不用 getByText 寻址——大纲条目与正文同文本会撞多个）
    const anchor = document.getElementById('zen-h-1')
    expect(anchor?.tagName).toBe('H2')
    expect(anchor).toHaveTextContent('上午')
  })

  test('auto 且主区宽 <900：默认不显示大纲', async () => {
    stubViewport(850)
    render(<FileDetail info={info} />)
    await screen.findByTestId('md-preview')
    expect(screen.queryByTestId('outline-panel')).not.toBeInTheDocument()
  })

  test('auto 恰 900px（边界含）显示', async () => {
    stubViewport(900)
    render(<FileDetail info={info} />)
    expect(await screen.findByTestId('outline-panel')).toBeInTheDocument()
  })

  test('on 恒显、off 恒隐（显式偏好覆盖响应式默认）', async () => {
    useAppStore.setState({ previewOutline: 'on' })
    stubViewport(850)
    render(<FileDetail info={info} />)
    expect(await screen.findByTestId('outline-panel')).toBeInTheDocument()
    cleanup()
    useAppStore.setState({ previewOutline: 'off' })
    stubViewport(950)
    render(<FileDetail info={info} />)
    await screen.findByTestId('md-preview')
    expect(screen.queryByTestId('outline-panel')).not.toBeInTheDocument()
  })

  test('点击开关钮：偏好从 auto 转显式 off，面板即时收起', async () => {
    stubViewport(950)
    render(<FileDetail info={info} />)
    await screen.findByTestId('outline-panel')
    fireEvent.click(screen.getByTestId('btn-outline-toggle'))
    expect(useAppStore.getState().previewOutline).toBe('off')
    expect(screen.queryByTestId('outline-panel')).not.toBeInTheDocument()
  })

  test('点击大纲条目滚动定位正文锚点', async () => {
    stubViewport(950)
    render(<FileDetail info={info} />)
    await screen.findByTestId('outline-panel')
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    fireEvent.click(screen.getByTestId('outline-zen-h-2'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(document.getElementById('zen-h-2')).not.toBeNull()
  })
})
