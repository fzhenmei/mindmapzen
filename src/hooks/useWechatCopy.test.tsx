// src/hooks/useWechatCopy.test.tsx —— 复制为公众号格式（2026-09 砚栏复制组旁，三态恒显）：
// 点击时从内存树现场序列化 display 形态 md（与 MarkdownView 显示同口径——所见即所复制，
// 含未保存修改）喂公众号全链。真 copyWechatHtmlFromMd 链，渲染/mermaid mock 注入代表性 DOM。
import { act, renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useWechatCopy } from './useWechatCopy'
import { renderVditorPreview } from '../services/vditorPreview'
import { showToast, subscribeToast } from '../services/toast'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { MindMapHandle } from '../types/engine'

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

const emptyRegistry = { byUid: new Map() } as unknown as LinkRegistry

/** 引擎桩：getData 返回最小树（tag 数组 = 引擎字段，engineTreeToZen 还原 ZenNode.tags） */
function makeMmRef(tree: unknown) {
  const mm = { getData: () => tree, on: vi.fn(), off: vi.fn() }
  const mmRef = createRef<never>()
  ;(mmRef as { current: unknown }).current = mm
  return mmRef as unknown as { current: MindMapHandle | null }
}

/** 带标签节点树：序列化 md 含 `# 标签` 行尾标记（复制链应剥净） */
const TREE_TAG = {
  data: { text: '根节点', uid: 'root', tag: ['标签'] },
  children: [{ data: { text: '子节点', uid: 'n1' }, children: [] }],
}
const TREE = {
  data: { text: '根节点', uid: 'root' },
  children: [{ data: { text: '子节点', uid: 'n1' }, children: [] }],
}

/** 轻提示观察（真 toast 服务订阅，非 mock）：订阅载荷是 ToastItem，落 .text 串 */
const toastTexts: (string | null)[] = []
subscribeToast((item) => {
  toastTexts.push(item === null ? null : item.text)
})

describe('useWechatCopy：Markdown 态砚栏「复制为公众号格式」', () => {
  beforeEach(() => {
    showToast('') // 清残留（覆盖式单条）
    toastTexts.length = 0
    vi.clearAllMocks()
  })

  test('run()：内存树现场序列化（display 形态）喂全链，标记剥净 → section HTML 写端口 + 成功轻提示', async () => {
    const htmls: string[] = []
    const writeHtml = vi.fn(async (html: string) => {
      htmls.push(html)
    })
    const { result } = renderHook(() => useWechatCopy(makeMmRef(TREE_TAG), emptyRegistry, writeHtml))
    act(() => {
      result.current.run()
    })
    await waitFor(() => expect(htmls).toHaveLength(1))
    expect(htmls[0]).toContain('<section')
    expect(htmls[0]).toContain('font-size: 15px')
    // 喂链的是 display 序列化文本：结构保留、行尾标记剥净（渲染入参观测）
    const fed = vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]!
    expect(fed).toContain('# 根节点')
    expect(fed).not.toContain('#标签')
    expect(fed).toContain('## 子节点')
    await waitFor(() => expect(toastTexts.at(-1)).toBe('已复制为公众号格式，可到公众号编辑器粘贴'))
  })

  test('序列化抛错（毒节点）→ 失败轻提示 + console 线索，不触富文本端口', async () => {
    const writeHtml = vi.fn(async () => {})
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() =>
      useWechatCopy(makeMmRef({ data: { text: '带\r换行', uid: 'root' }, children: [] }), emptyRegistry, writeHtml),
    )
    act(() => {
      result.current.run()
    })
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/复制为公众号格式失败/))
    expect(spy).toHaveBeenCalled()
    expect(writeHtml).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('端口拒绝 → 失败轻提示 + console 线索（不吞异常）', async () => {
    const writeHtml = vi.fn(async () => {
      throw new Error('剪贴板写入失败')
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useWechatCopy(makeMmRef(TREE), emptyRegistry, writeHtml))
    act(() => {
      result.current.run()
    })
    await waitFor(() => expect(toastTexts.at(-1)).toMatch(/复制为公众号格式失败/))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test('在途禁连点：busy=true 期间再 run() no-op，完成后复位', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const htmls: string[] = []
    const writeHtml = vi.fn(async (html: string) => {
      await gate
      htmls.push(html)
    })
    const { result } = renderHook(() => useWechatCopy(makeMmRef(TREE), emptyRegistry, writeHtml))
    act(() => {
      result.current.run()
    })
    await waitFor(() => expect(result.current.busy).toBe(true))
    act(() => {
      result.current.run() // 在途再点：no-op
    })
    release()
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(writeHtml).toHaveBeenCalledTimes(1)
    expect(htmls).toHaveLength(1)
  })
})
