// src/views/MarkdownView.test.tsx —— MarkdownView：内存树序列化渲染 + data_change 重算 + Esc 回导图 + 大纲偏好。
// （「复制为公众号格式」出口已移砚栏 Markdown 态专有钮，逻辑测试见 useWechatCopy.test）
// MarkdownPreview mock 为透传 div（ChatPanel.test 同款），断言序列化文本经 props 到位。
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('../components/MarkdownPreview', () => ({
  default: ({ text }: { text: string }) => <div data-testid="md-preview" data-text={text} />,
}))

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
import MarkdownView from './MarkdownView'
import type { LinkRegistry } from '../editor/linkRegistry'

const emptyRegistry = { byUid: new Map() } as unknown as LinkRegistry

describe('MarkdownView', () => {
  beforeEach(() => {
    useAppStore.setState({ previewOutline: 'auto', outlineWidth: null })
  })

  test('挂载即序列化渲染：标题文本经 MarkdownPreview 呈现', () => {
    const mm = makeMm(TREE)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} />)
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
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} />)
    const text = screen.getByTestId('md-preview').dataset.text!
    expect(text).toContain('## 贴来的标题')
    expect(text).not.toContain('> ##')
  })

  test('data_change 重算：树变更后重新序列化', () => {
    let tree = TREE
    const mm = makeMm({ get data() { return tree.data }, get children() { return tree.children } })
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} />)
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
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={onClose} />)
    fireEvent.keyDown(screen.getByTestId('markdown-view'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  test('序列化抛错出错误占位（不吞异常）', () => {
    const mm = makeMm({ data: { text: '带\r换行', uid: 'root' }, children: [] })
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId('markdown-view-error')).toBeInTheDocument()
    spy.mockRestore()
  })

  test('pref=on 渲染大纲面板', () => {
    useAppStore.setState({ previewOutline: 'on' })
    const mm = makeMm(TREE)
    const mmRef = createRef<never>()
    ;(mmRef as { current: unknown }).current = mm
    render(<MarkdownView mmRef={mmRef as never} registry={emptyRegistry} onOutlineVisibleChange={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId('outline-panel')).toBeInTheDocument()
  })
})
