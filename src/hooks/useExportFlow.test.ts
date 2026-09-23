// src/hooks/useExportFlow.test.ts —— 导出 Word 全链单测：现场 display 序列化 → 保存对话框 →
// docx 字节写盘；取消静默、序列化同步失败 toast、链路失败 toast（编辑器侧失败出口惯例）。
// Word 打包走真 buildDocxFromBody（PK 头断言即证），adapter 用真 MemoryFsAdapter
//（renderPublishBody 需要 FsAdapter 面；writeBytes 以 spyOn 记录断言）
import { act, renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useExportFlow } from './useExportFlow'
import { renderVditorPreview } from '../services/vditorPreview'
import { showToast, subscribeToast } from '../services/toast'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { MindMapHandle } from '../types/engine'
import type { ExportPorts } from '../types/ports'

// 发布链渲染 mock（wechatCopy.test 同款口径）：注入代表性 DOM（jsdom 不跑 vditor），
// mermaid 成图 no-op（无 canvas）；插图解析/代码高亮走真（本用例无图片/工作区）
vi.mock('../services/vditorPreview', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../services/vditorPreview')>()
  return {
    ...orig,
    renderVditorPreview: vi.fn(async (el: HTMLElement) => {
      el.innerHTML = '<div class="vditor-reset"><p>正文</p></div>'
    }),
  }
})
vi.mock('../services/mermaidImage', () => ({ replaceMermaidCode: vi.fn(async () => {}) }))

const emptyRegistry = { byUid: new Map() } as unknown as LinkRegistry
const TREE = { data: { text: '根节点', uid: 'root' }, children: [] }

/** 引擎桩：getData 返回最小树（engineTreeToZen 还原 ZenNode，序列化出 `# 根节点`） */
function makeMmRef(tree: unknown) {
  const mm = { getData: () => tree, on: vi.fn(), off: vi.fn() }
  const mmRef = createRef<never>()
  ;(mmRef as { current: unknown }).current = mm
  return mmRef as unknown as { current: MindMapHandle | null }
}

/** 导出端口桩（runEdgePrint 已入 ExportPorts 面，2026-09-23 导出 PDF 接口化） */
function makePorts(savePath: string | null): ExportPorts {
  return {
    pickSavePath: vi.fn(async () => savePath),
    writeImage: vi.fn(async () => {}),
    runEdgePrint: vi.fn(async () => {}),
  }
}

/** 轻提示观察（真 toast 服务订阅，非 mock）：订阅载荷是 ToastItem，落 .text 串 */
const toastTexts: (string | null)[] = []
subscribeToast((item) => {
  toastTexts.push(item === null ? null : item.text)
})

describe('useExportFlow：导出 Word', () => {
  beforeEach(() => {
    showToast('') // 清残留（覆盖式单条）
    toastTexts.length = 0
    vi.clearAllMocks()
  })

  test('onWord：display 序列化 → pickSavePath(.docx) → PK 头字节写盘 → 盖「已存」', async () => {
    const adapter = new MemoryFsAdapter()
    const writeBytes = vi.spyOn(adapter, 'writeBytes')
    const ports = makePorts('/ws/导出/图.docx')
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(writeBytes).toHaveBeenCalled())
    expect(ports.pickSavePath).toHaveBeenCalledWith('图.docx')
    const [, bytes] = writeBytes.mock.calls[0]!
    expect(bytes![0]).toBe(0x50) // PK：真 docx 容器
    // 盖章在 await 写盘之后：与写盘检测间隔若干微任务，独立 waitFor 防竞态误判
    await waitFor(() => expect(stamp).toHaveBeenCalledWith('saved'))
    // 序列化口径：display 形态（结构保留，不落防炸包装）
    const fed = vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]!
    expect(fed).toContain('# 根节点')
  })

  test('取消保存对话框：静默放弃，不写盘不盖章', async () => {
    const adapter = new MemoryFsAdapter()
    const writeBytes = vi.spyOn(adapter, 'writeBytes')
    const ports = makePorts(null)
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(ports.pickSavePath).toHaveBeenCalled())
    expect(writeBytes).not.toHaveBeenCalled()
    expect(stamp).not.toHaveBeenCalled()
  })

  test('序列化同步失败（毒节点）：toast + console 线索，不触保存对话框', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = new MemoryFsAdapter()
    const writeBytes = vi.spyOn(adapter, 'writeBytes')
    const ports = makePorts('/ws/导出/图.docx')
    const { result } = renderHook(() =>
      useExportFlow(
        makeMmRef({ data: { text: '带\r换行', uid: 'root' }, children: [] }),
        adapter, '图', ports, emptyRegistry, vi.fn(), vi.fn(),
      ),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/导出失败/))
    expect(spy).toHaveBeenCalled()
    expect(ports.pickSavePath).not.toHaveBeenCalled()
    expect(writeBytes).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('链路失败（writeBytes 拒绝）：toast + console 线索，不盖章', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = new MemoryFsAdapter()
    vi.spyOn(adapter, 'writeBytes').mockImplementation(async () => {
      throw new Error('磁盘满')
    })
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', makePorts('/ws/导出/图.docx'), emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/导出失败/))
    expect(spy).toHaveBeenCalled()
    expect(stamp).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('useExportFlow：导出 PDF', () => {
  beforeEach(() => {
    showToast('') // 清残留（覆盖式单条）
    toastTexts.length = 0
    vi.clearAllMocks()
  })

  test('onPdf：pickSavePath(.pdf) → runEdgePrint 收打印 HTML（含 @page）与目标路径 → 盖「已存」', async () => {
    const adapter = new MemoryFsAdapter()
    const writeSpy = vi.spyOn(adapter, 'writeBytes')
    const ports = makePorts('/ws/导出/图.pdf')
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onPdf()
    })
    await waitFor(() => expect(ports.runEdgePrint).toHaveBeenCalled())
    const [html, pdfPath] = vi.mocked(ports.runEdgePrint).mock.calls[0]!
    expect(pdfPath).toBe('/ws/导出/图.pdf')
    expect(html).toContain('@page{size:A4;margin:2cm}')
    expect(html).toContain('正文') // 渲染体在打印文档内（mock 渲染注入标记 <p>正文</p>）
    expect(stamp).toHaveBeenCalledWith('saved')
    expect(writeSpy).not.toHaveBeenCalled() // PDF 不走前端写盘
  })

  test('runEdgePrint 拒绝：toast + console 线索，不盖章', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ports = makePorts('/ws/导出/图.pdf')
    vi.mocked(ports.runEdgePrint).mockImplementation(async () => {
      throw new Error('未找到 Microsoft Edge')
    })
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), new MemoryFsAdapter(), '图', ports, emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onPdf()
    })
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/导出失败/))
    expect(spy).toHaveBeenCalled()
    expect(stamp).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
