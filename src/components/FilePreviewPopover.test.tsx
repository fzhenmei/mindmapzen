// src/components/FilePreviewPopover.test.tsx —— 案头悬浮预览（2026-09 画布三态 M2，
// FileDetail 详情态退役承接）：单击文件行在右区右上角浮现的预览小窗。
// 读取管线迁自 FileDetail（真实 md + 插图 dataURL + 失败兜底），轻量无大纲。
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import FilePreviewPopover from './FilePreviewPopover'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { renderVditorPreview } from '../services/vditorPreview'
import type { MapInfo } from '../types/files'

// jsdom 不执行 vditor 注入的子资源脚本（渲染 promise 永不 resolve），真实渲染归 e2e；
// 单测 mock renderVditorPreview 注入代表性 DOM（标题行 → 标题元素）——沿 FileDetail.test 同款
vi.mock('../services/vditorPreview', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../services/vditorPreview')>()
  return {
    ...orig,
    renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
      el.innerHTML = md
        .split('\n')
        .flatMap((l) => {
          const m = /^(#{1,6})\s/.exec(l)
          if (m === null) return []
          const level = m[1].length
          return [`<h${level}>${l.slice(m[0].length)}</h${level}>`]
        })
        .join('')
    }),
  }
})

const INFO: MapInfo = { mdPath: '/ws/甲.md', name: '甲', relDir: '', size: 10, createdAt: 1, modifiedAt: 2 }

function makeInfo(over: Partial<MapInfo>): MapInfo { return { ...INFO, ...over } }

describe('FilePreviewPopover', () => {
  // fs 预置沿 FileDetail.test 模式：内存 adapter 注入 + 工作区目录 + 预置 md 文件
  beforeEach(async () => {
    useAppStore.setState({ adapter: new MemoryFsAdapter(), workspaceDir: '/ws' })
    await useAppStore.getState().adapter.writeTextFileAtomic('/ws/甲.md', '# 标题甲\n\n正文')
    await useAppStore.getState().adapter.writeTextFileAtomic('/ws/乙.md', '# 标题乙\n')
  })

  test('渲染选中 md：头部文件名 + 正文经 MarkdownPreview', async () => {
    render(<FilePreviewPopover info={makeInfo({})} onClose={() => {}} />)
    expect(screen.getByTestId('file-preview-popover')).toBeInTheDocument()
    expect(screen.getByText('甲.md')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('标题甲')).toBeInTheDocument())
  })

  test('正文包装层剥净进预览渲染（贴来的标题不带 > 前缀，2026-09-22 防炸配套）', async () => {
    await useAppStore.getState().adapter.writeTextFileAtomic(
      '/ws/甲.md',
      '# 甲\n\n## A\n> 段落。\n>\n> ## 小标题\n',
    )
    // 文件级 mock 无逐测试清理:先清陈旧调用,再等待本次读盘渲染的新调用(全量套件
    // 慢环境下 waitFor 会命中前序用例的旧调用,at(-1) 取到的是别人的入参)
    vi.mocked(renderVditorPreview).mockClear()
    render(<FilePreviewPopover info={makeInfo({})} onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(renderVditorPreview)).toHaveBeenCalledTimes(1))
    const md = vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]!
    expect(md).toContain('## 小标题')
    expect(md).not.toContain('> ##')
  })

  test('读取失败：错误占位含路径（显式出口，不吞异常）', async () => {
    // 不预置 /ws/缺.md（读取抛错）
    render(<FilePreviewPopover info={makeInfo({ mdPath: '/ws/缺.md', name: '缺' })} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('file-preview-error')).toBeInTheDocument())
    expect(screen.getByTestId('file-preview-error').textContent).toContain('缺.md')
  })

  // Windows 路径出口（迁自 FileDetail.test）：给人看的错误路径归一为原生 '\'
  test('Windows 下错误路径分隔符归一为反斜杠', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
    try {
      render(<FilePreviewPopover info={makeInfo({ mdPath: 'C:\\ws\\docs\\甲/a.md' })} onClose={() => {}} />)
      expect(await screen.findByText('C:\\ws\\docs\\甲\\a.md')).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(navigator, 'platform')
    }
  })

  // 正文引用块行中图片换 dataURL（迁自 FileDetail.test，收集口径全文化）：
  // collectMdImageSrcs 超集口径，行中图（`> 前置 ![](a) 后置`）行尾口径收不到
  test('正文引用块行中图片换 dataURL（收集口径全文化）', async () => {
    const fs = new MemoryFsAdapter()
    useAppStore.setState({ adapter: fs })
    await fs.writeTextFileAtomic('/ws/甲.md', '# 甲\n\n> 前置 ![中图](assets/mid.png) 后置\n')
    await fs.writeBytes('/ws/assets/mid.png', new Uint8Array([7]))
    vi.mocked(renderVditorPreview).mockImplementationOnce(async (el: HTMLElement) => {
      const img = document.createElement('img')
      img.src = 'assets/mid.png'
      el.append(img)
    })
    render(<FilePreviewPopover info={makeInfo({})} onClose={() => {}} />)
    await waitFor(() =>
      expect(document.querySelector('[data-testid="md-preview"] img')!.getAttribute('src')).toBe(
        'data:image/png;base64,Bw==',
      ),
    )
  })

  test('Esc 关窗（非输入域）；关闭钮关窗', () => {
    const onClose = vi.fn()
    render(<FilePreviewPopover info={makeInfo({})} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('btn-preview-close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('Esc 输入域守卫：焦点在输入框时不关窗', () => {
    const onClose = vi.fn()
    render(<FilePreviewPopover info={makeInfo({})} onClose={onClose} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    // 在聚焦元素上派发（冒泡至 window 监听，target=input）——真实浏览器键盘事件的
    // target 即聚焦元素；window 直发的 target 是 window 本身，测不出守卫（同
    // EditorView.test 数字键直达输入域守卫用例的派发约定）
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    input.remove()
  })

  test('Radix 已消费的 Esc（defaultPrevented）不关窗；未 prevent 的 Esc 照常关', () => {
    // I-1 回归钉（仿 KanbanView.test 同名先例）：Radix DismissableLayer（右键菜单等）
    // 在 ownerDocument capture 阶段对 Escape 调原生 preventDefault()（其 dist 源码：
    // addEventListener('keydown', handleKeyDown, { capture: true })），事件仍冒泡到本窗
    // 的 window keydown 监听。此处构造 defaultPrevented=true 的 keyDown 派发到 window，
    // 模拟 Radix capture 层的最终效果；!defaultPrevented 守卫承重，误删则本用例转红。
    // 随后未 prevent 的 Esc 为对照锚：正常关窗
    const onClose = vi.fn()
    render(<FilePreviewPopover info={makeInfo({})} onClose={onClose} />)
    const event = createEvent.keyDown(window, { key: 'Escape' })
    Object.defineProperty(event, 'defaultPrevented', { value: true })
    fireEvent(window, event)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('点浮窗外部关窗；点浮窗内部不关', () => {
    const onClose = vi.fn()
    render(<FilePreviewPopover info={makeInfo({})} onClose={onClose} />)
    fireEvent.mouseDown(screen.getByTestId('file-preview-popover'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('切换目标文件：info 变化重读（内容切换非叠加）', async () => {
    const { rerender } = render(<FilePreviewPopover info={makeInfo({})} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('标题甲')).toBeInTheDocument())
    rerender(<FilePreviewPopover info={makeInfo({ mdPath: '/ws/乙.md', name: '乙' })} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('标题乙')).toBeInTheDocument())
    expect(screen.queryByText('标题甲')).toBeNull()
  })
})
