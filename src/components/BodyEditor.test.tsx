// src/components/BodyEditor.test.tsx —— 正文 WYSIWYG 编辑器封装测试(2026-09 正文功能 Task 5)。
// 技术栈按 Task 1 Go 结论:Tiptap 3.31 + tiptap-markdown(roundtrip 实测记录见
// bodyEditor.roundtrip.test.ts 文件头,本测试的装配口径与它对齐)。
//
// ===== jsdom 驱动方式(实测可行,未触发降级预案)=====
// Tiptap 构造同步挂载(element 传宿主 div,视图 dom 追加为其子节点),jsdom 稳定;
// tiptap core 的 createView 会把 Editor 实例写到视图 dom 的 .editor 属性
// (TiptapEditorHTMLElement,d.ts 导出的公开类型)——测试经它取编辑器,
// 用命令链(insertContentAt → dispatchTransaction → update 事件)驱动「输入」,
// 走的就是真实事务管线;不模拟键盘事件(jsdom 不向 contenteditable 插入文本)。
// 真实敲键/中文输入法链路由 Task 8 e2e 兜底。
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import BodyEditor from './BodyEditor'

/** 从挂载容器取编辑器实例(视图 dom 类名 tiptap ProseMirror;.editor 属性由 tiptap core 写入) */
const editorOf = (container: HTMLElement): Editor => {
  const view = container.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror')
  if (view === null || view.editor === undefined) throw new Error('未找到已挂载的编辑器实例')
  return view.editor
}

/** doc 内最后一个文本块的末尾位置(insertContentAt 在段内末尾追加,不产生新块)。
 *  ProseMirror 位置语义:descendants 给的 pos 在节点之前,须 +1 进入节点再走到内容末尾 */
const endOfLastTextblock = (editor: Editor): number => {
  let end = 0
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock) end = pos + 1 + node.content.size
  })
  return end
}

describe('BodyEditor', () => {
  afterEach(cleanup)

  test('挂载即渲染 value 文本,不触发 onChange', () => {
    const onChange = vi.fn()
    const { container } = render(<BodyEditor value="初始论述" onChange={onChange} />)
    expect(container.textContent).toContain('初始论述')
    expect(container.querySelector('.ProseMirror')).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  test('编辑器内输入 → onChange 即时回调最新 md;父层以该 md 回流 value 不再触发(防回环)', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<BodyEditor value="初始论述" onChange={onChange} />)
    const editor = editorOf(container)
    act(() => {
      editor.commands.insertContentAt(endOfLastTextblock(editor), '追加')
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('初始论述追加')
    // 受控回环模拟:父层把 onChange 的 md 作为 value 流回 → 序列化相同 → 不 setContent(doc 引用不变)、无新回调
    const docAfterEdit = editor.state.doc
    rerender(<BodyEditor value="初始论述追加" onChange={onChange} />)
    expect(editor.state.doc).toBe(docAfterEdit)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('value 外部变更(切换节点)→ 内容整体替换且不触发 onChange', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<BodyEditor value="A 节点论述" onChange={onChange} />)
    rerender(<BodyEditor value="B 节点论述" onChange={onChange} />)
    expect(container.textContent).toContain('B 节点论述')
    expect(container.textContent).not.toContain('A 节点论述')
    expect(onChange).not.toHaveBeenCalled()
    // 替换后的 doc 即为新 value 的形态:后续输入从新内容续写
    const editor = editorOf(container)
    act(() => {
      editor.commands.insertContentAt(endOfLastTextblock(editor), '!')
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('B 节点论述!')
  })

  test('value 与当前序列化相同 → 不动(doc 引用不变)', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<BodyEditor value="论述" onChange={onChange} />)
    const editor = editorOf(container)
    const docBefore = editor.state.doc
    rerender(<BodyEditor value="论述" onChange={onChange} />)
    expect(editor.state.doc).toBe(docBefore)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('表格场景 onChange 的 md 无文末换行(存库口径:去掉恰好一个尾 \\n)', () => {
    const onChange = vi.fn()
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    const { container } = render(<BodyEditor value={table} onChange={onChange} />)
    const editor = editorOf(container)
    act(() => {
      editor.commands.insertContentAt(endOfLastTextblock(editor), 'x')
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const md = onChange.mock.lastCall?.[0] ?? ''
    // 尾单元格拉进一个字符:表格结构保真、仅文末字符变化,且无文末换行
    expect(md).toBe('| a | b |\n| --- | --- |\n| 1 | 2x |')
    expect(md.endsWith('\n')).toBe(false)
  })

  test('schema 无 heading/list:md 输入不产生结构节点,# 与 - 以字面留存', () => {
    const onChange = vi.fn()
    const { container } = render(<BodyEditor value="# 标题\n\n- 列表项" onChange={onChange} />)
    // DOM 级:不渲染任何标题/列表结构
    expect(container.querySelector('h1,h2,h3,h4,h5,h6,ul,ol')).toBeNull()
    expect(container.textContent).toContain('# 标题')
    expect(container.textContent).toContain('- 列表项')
    // doc 级:禁用节点类型一个不出现(与 roundtrip 测试 nodeTypesOf 同口径)
    const editor = editorOf(container)
    const types = new Set<string>()
    editor.state.doc.descendants((node) => {
      types.add(node.type.name)
    })
    for (const banned of ['heading', 'bulletList', 'orderedList', 'listItem']) {
      expect(types.has(banned), `出现 ${banned} 节点`).toBe(false)
    }
    // 序列化级:onChange 发出的 md 无行首标题/列表结构形态(转义字面,实测口径见 roundtrip 文件头)
    act(() => {
      editor.commands.insertContentAt(endOfLastTextblock(editor), '。')
    })
    const md = onChange.mock.lastCall?.[0] ?? ''
    expect(md).not.toMatch(/^#{1,6} /m)
    expect(md).not.toMatch(/^[-*] /m)
    expect(md.replace(/\\/g, '')).toContain('# 标题')
  })

  test('readOnly → contenteditable=false,切换可翻转', () => {
    const { container, rerender } = render(<BodyEditor value="论述" onChange={() => {}} readOnly />)
    const view = container.querySelector('.ProseMirror')
    expect(view?.getAttribute('contenteditable')).toBe('false')
    rerender(<BodyEditor value="论述" onChange={() => {}} />)
    expect(view?.getAttribute('contenteditable')).toBe('true')
  })

  test('默认可编辑(contenteditable=true)', () => {
    const { container } = render(<BodyEditor value="论述" onChange={() => {}} />)
    expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
  })
})
