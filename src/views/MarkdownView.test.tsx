// src/views/MarkdownView.test.tsx —— MarkdownView：内存树序列化渲染 + data_change 重算 + Esc 回导图 + 大纲偏好
// + 复制为公众号格式钮（真 copyWechatHtmlFromMd 链，渲染/mermaid mock 注入代表性 DOM）。
// MarkdownPreview mock 为透传 div（ChatPanel.test 同款），断言序列化文本经 props 到位。
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('../components/MarkdownPreview', () => ({
  default: ({ text }: { text: string }) => <div data-testid="md-preview" data-text={text} />,
}))

// 公众号复制链（wechatCopy.test 同款口径）：渲染注入代表性 DOM（jsdom 不跑 vditor），
// mermaid 成图 no-op（无 canvas）；codeHighlight/插图解析走真（本用例无代码块/工作区）
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

// 引擎桩：getData 返回最小 EngineNode 树；on/off 捕获订阅
function makeMm(tree: unknown) {
  const listeners: Record<string, () => void> = {}
  return {
    getData: () => tree,
    on: vi.fn((ev: string, fn: () => void) => { listeners[ev] = fn }),
    off: vi.fn(),
    fire: (ev: string) => listeners[ev]?.(),
  }
}
const TREE = {
  data: { text: '根节点', uid: 'root' },
  children: [{ data: { text: '子节点', uid: 'n1' }, children: [] }],
}

// 大纲偏好默认 auto：宽判定 hook 在 jsdom offsetWidth=0 下恒 false → 大纲不渲染
import { useAppStore } from '../store/appStore'
import { renderVditorPreview } from '../services/vditorPreview'
import { showToast, subscribeToast } from '../services/toast'
import MarkdownView from './MarkdownView'
import type { LinkRegistry } from '../editor/linkRegistry'

const emptyRegistry = { byUid: new Map() } as unknown as LinkRegistry

/** 既有用例共用的富文本剪贴板桩（无断言，防缺 prop） */
const stubWriteHtml = vi.fn(async () => {})

describe('MarkdownView', () => {
  beforeEach(() => {
    useAppStore.setState({ previewOutline: 'auto', outlineWidth: null })
  })

  test('挂载即序列化渲染：标题文本经 MarkdownPreview 呈现', () => {
    const mm = makeMm(TREE)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} writeHtmlClipboard={stubWriteHtml} />)
    expect(screen.getByTestId('md-preview').dataset.text).toContain('# 根节点')
    expect(screen.getByTestId('md-preview').dataset.text).toContain('## 子节点')
    expect(mm.on).toHaveBeenCalledWith('data_change', expect.any(Function))
  })

  test('显示形态序列化：含结构行的正文不加引用包装（查看态按真实内容渲染）', () => {
    const tree = {
      data: { text: '根节点', uid: 'root' },
      children: [{ data: { text: '子节点', uid: 'n1', body: '段落。\n\n## 贴来的标题' }, children: [] }],
    }
    const mm = makeMm(tree)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} writeHtmlClipboard={stubWriteHtml} />)
    const text = screen.getByTestId('md-preview').dataset.text!
    expect(text).toContain('## 贴来的标题')
    expect(text).not.toContain('> ##')
  })

  test('data_change 重算：树变更后重新序列化', () => {
    let tree = TREE
    const mm = makeMm({ get data() { return tree.data }, get children() { return tree.children } })
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} writeHtmlClipboard={stubWriteHtml} />)
    tree = { data: { text: '新根', uid: 'root' }, children: [] }
    // fire 在 render() 的 act 作用域外裸调 setMd，React 18 异步调度不 flush——包 act 收割
    act(() => {
      mm.fire('data_change')
    })
    expect(screen.getByTestId('md-preview').dataset.text).toContain('# 新根')
  })

  test('Esc 回导图（onClose）', () => {
    const onClose = vi.fn()
    const mm = makeMm(TREE)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={onClose} writeHtmlClipboard={stubWriteHtml} />)
    fireEvent.keyDown(screen.getByTestId('markdown-view'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  test('序列化抛错出错误占位（不吞异常）', () => {
    const mm = makeMm({ data: { text: '带\r换行', uid: 'root' }, children: [] })
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} writeHtmlClipboard={stubWriteHtml} />)
    expect(screen.getByTestId('markdown-view-error')).toBeInTheDocument()
    spy.mockRestore()
  })

  test('pref=on 渲染大纲面板', () => {
    useAppStore.setState({ previewOutline: 'on' })
    const mm = makeMm(TREE)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} writeHtmlClipboard={stubWriteHtml} />)
    expect(screen.getByTestId('outline-panel')).toBeInTheDocument()
  })
})

// ---- 复制为公众号格式钮（2026-09 画布 Markdown 视图）：所见即所复制 + 轻提示出口 ----

/** 带标签节点树：序列化 md 含 `# 标签` 行尾标记（渲染/复制链应剥净）。
 *  引擎树字段 = data.tag（数组，engineTreeToZen 还原为 ZenNode.tags） */
const TREE_TAG = {
  data: { text: '根节点', uid: 'root', tag: ['标签'] },
  children: [{ data: { text: '子节点', uid: 'n1' }, children: [] }],
}

/** 轻提示观察（真 toast 服务订阅，非 mock）：订阅载荷是 ToastItem，落 .text 串；
 *  订阅即刻回放当前值，beforeEach 清残留后再清数组 */
const toastTexts: (string | null)[] = []
subscribeToast((item) => {
  toastTexts.push(item === null ? null : item.text)
})

describe('MarkdownView:复制为公众号格式', () => {
  beforeEach(() => {
    useAppStore.setState({ previewOutline: 'auto', outlineWidth: null, workspaceDir: null })
    showToast('') // 清残留（覆盖式单条）
    toastTexts.length = 0
    vi.clearAllMocks()
  })

  function renderMdView(tree: unknown, writeHtml: (html: string) => Promise<void>) {
    const mm = makeMm(tree)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    return render(
      <MarkdownView
        mmRef={mmRef as never}
        registry={emptyRegistry}
        onOutlineVisibleChange={() => {}}
        onClose={() => {}}
        writeHtmlClipboard={writeHtml}
      />,
    )
  }

  test('点击：当前显示 md 喂全链（标记剥净进渲染）→ section HTML 写富文本端口 + 成功轻提示', async () => {
    const htmls: string[] = []
    const writeHtml = vi.fn(async (html: string) => {
      htmls.push(html)
    })
    renderMdView(TREE_TAG, writeHtml)
    // 显示形态 md 含标记（渲染层才剥）——所见文本即复制输入
    const shown = screen.getByTestId('md-preview').dataset.text!
    expect(shown).toContain('# 根节点 #标签')
    fireEvent.click(screen.getByTestId('btn-copy-wechat'))
    await waitFor(() => expect(htmls).toHaveLength(1))
    expect(htmls[0]).toContain('<section')
    expect(htmls[0]).toContain('font-size: 15px')
    // 全链预处理后进渲染：标记剥净、结构保留
    const fed = vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]!
    expect(fed).toContain('# 根节点')
    expect(fed).not.toContain('#标签')
    expect(fed).toContain('## 子节点')
    await waitFor(() => expect(toastTexts.at(-1)).toBe('已复制为公众号格式，可到公众号编辑器粘贴'))
  })

  test('复制失败：端口拒绝 → 轻提示失败文案 + console 线索（不吞异常）', async () => {
    const writeHtml = vi.fn(async () => {
      throw new Error('剪贴板写入失败')
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderMdView(TREE, writeHtml)
    fireEvent.click(screen.getByTestId('btn-copy-wechat'))
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/复制为公众号格式失败/))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test('在途禁用防连点：复制中按钮 disabled，完成后复位', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const htmls: string[] = []
    const writeHtml = vi.fn(async (html: string) => {
      await gate
      htmls.push(html)
    })
    renderMdView(TREE, writeHtml)
    const btn = screen.getByTestId('btn-copy-wechat')
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    release()
    await waitFor(() => expect(btn).toBeEnabled())
    expect(htmls).toHaveLength(1)
  })

  test('序列化失败占位态不渲染复制钮（无内容可复制）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderMdView({ data: { text: '带\r换行', uid: 'root' }, children: [] }, vi.fn(async () => {}))
    expect(screen.getByTestId('markdown-view-error')).toBeInTheDocument()
    expect(screen.queryByTestId('btn-copy-wechat')).toBeNull()
    spy.mockRestore()
  })
})
