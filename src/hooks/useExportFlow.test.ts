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

/** 引擎桩：getData 返回最小树（engineTreeToZen 还原 ZenNode，序列化出 `# 根节点`）；
 *  doExport 供 PNG/SVG 链（requireExport 核验 + dataURL 解码，字节内容本组用例不断言） */
function makeMmRef(tree: unknown) {
  const mm = {
    getData: () => tree,
    on: vi.fn(),
    off: vi.fn(),
    doExport: { png: async () => 'data:image/png;base64,QUJD', svg: async () => 'data:image/svg+xml;base64,QUJD' },
  }
  const mmRef = createRef<never>()
  ;(mmRef as { current: unknown }).current = mm
  return mmRef as unknown as { current: MindMapHandle | null }
}

/** 导出端口桩（runEdgePrint/ask/openExported 已入 ExportPorts 面，2026-09-23 导出 PDF + 导出后打开） */
function makePorts(savePath: string | null): ExportPorts {
  return {
    pickSavePath: vi.fn(async () => savePath),
    writeImage: vi.fn(async () => {}),
    runEdgePrint: vi.fn(async () => {}),
    ask: vi.fn(async () => false),
    openExported: vi.fn(async () => {}),
  }
}

/** 轻提示观察（真 toast 服务订阅，非 mock）：订阅载荷是 ToastItem，落 .text 串
 *  与 durationMs（2026-09-23 报障可读性：错误类 6s、成功类缺省） */
const toastTexts: (string | null)[] = []
const toastDurations: (number | undefined)[] = []
subscribeToast((item) => {
  toastTexts.push(item === null ? null : item.text)
  toastDurations.push(item === null ? undefined : item.durationMs)
})

describe('useExportFlow：导出 Word', () => {
  beforeEach(() => {
    showToast('') // 清残留（覆盖式单条）
    toastTexts.length = 0
    toastDurations.length = 0
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

  test('Word 导出中：粘住等待提示出现，成功后清除再盖章问询', async () => {
    // 门闩卡 writeBytes：观察"进行中"快照——等待提示须粘住（durationMs=Infinity，
    // ToastHost 不排自动消失），不能靠 2s 默认时长侥幸存活
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const adapter = new MemoryFsAdapter()
    const writeBytes = vi.spyOn(adapter, 'writeBytes').mockImplementation(async () => {
      await gate
    })
    const ports = makePorts('/ws/导出/图.docx') // ask 默认答否
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(writeBytes).toHaveBeenCalled())
    // 卡在写盘期间：等待提示已出现且为粘住时长；链路未完成不盖章
    const stuckAt = toastTexts.findIndex((t) => t !== null && /正在导出/.test(t))
    expect(stuckAt).toBeGreaterThanOrEqual(0)
    expect(toastDurations[stuckAt]).toBe(Number.POSITIVE_INFINITY)
    expect(stamp).not.toHaveBeenCalled()
    release()
    // 成功：先清提示（末尾 null）再盖章、问询（默认答否不打开）
    await waitFor(() => expect(stamp).toHaveBeenCalledWith('saved'))
    await waitFor(() => expect(ports.ask).toHaveBeenCalled())
    expect(toastTexts.at(-1)).toBeNull()
    expect(ports.openExported).not.toHaveBeenCalled()
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

describe('useExportFlow：导出成功后询问直接打开', () => {
  beforeEach(() => {
    showToast('') // 清残留（覆盖式单条）
    toastTexts.length = 0
    vi.clearAllMocks()
  })

  test('Word 成功 + ask 答是：openExported 收 savePath，ask 消息含文件名（含扩展）', async () => {
    const adapter = new MemoryFsAdapter()
    const ports = makePorts('/ws/导出/图.docx')
    vi.mocked(ports.ask).mockImplementation(async () => true)
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, vi.fn(), vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(ports.openExported).toHaveBeenCalledWith('/ws/导出/图.docx'))
    const [message] = vi.mocked(ports.ask).mock.calls[0]!
    expect(message).toContain('图.docx')
  })

  test('ask 答否：openExported 零调用，静默无错误（正常路径）', async () => {
    const adapter = new MemoryFsAdapter()
    const ports = makePorts('/ws/导出/图.docx') // makePorts 默认 ask → false
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, vi.fn(), vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(ports.ask).toHaveBeenCalled())
    expect(ports.openExported).not.toHaveBeenCalled()
    // 2026-09-23 粘住等待提示：Word 链现会先「正在导出」再清除——末尾 null 且全程
    // 无错误文案，即"静默无错误"（原 toHaveLength(0) 断言随等待提示落地失效）
    expect(toastTexts.at(-1)).toBeNull()
    expect(toastTexts.filter((t) => t !== null).every((t) => /正在导出/.test(t))).toBe(true)
  })

  test('openExported 拒绝：toast 打开导出文件失败 + console 线索，stamp 仍已盖（saved 在问询前）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = new MemoryFsAdapter()
    const ports = makePorts('/ws/导出/图.docx')
    vi.mocked(ports.ask).mockImplementation(async () => true)
    vi.mocked(ports.openExported).mockImplementation(async () => {
      throw new Error('无关联程序')
    })
    const stamp = vi.fn()
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, stamp, vi.fn()),
    )
    act(() => {
      result.current.actions.onWord()
    })
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/打开导出文件失败/))
    // 错误类轻提示延长 6s(2026-09-23 报障可读性:2s 读不完带原因/路径的文案)
    expect(toastDurations.at(-1)).toBe(6000)
    expect(spy).toHaveBeenCalled()
    expect(stamp).toHaveBeenCalledWith('saved')
    spy.mockRestore()
  })

  test('PNG 成功 + ask 答是：同样走问询（runExport 链）', async () => {
    const adapter = new MemoryFsAdapter()
    const ports = makePorts('/ws/导出/图.png')
    vi.mocked(ports.ask).mockImplementation(async () => true)
    const { result } = renderHook(() =>
      useExportFlow(makeMmRef(TREE), adapter, '图', ports, emptyRegistry, vi.fn(), vi.fn()),
    )
    act(() => {
      result.current.actions.onPng()
    })
    await waitFor(() => expect(ports.openExported).toHaveBeenCalledWith('/ws/导出/图.png'))
    const [message] = vi.mocked(ports.ask).mock.calls[0]!
    expect(message).toContain('图.png')
  })
})
