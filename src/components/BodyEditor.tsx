// src/components/BodyEditor.tsx —— 节点正文 WYSIWYG 编辑器(2026-09 正文功能 Task 5):
// Tiptap 3 + tiptap-markdown 封装(Task 1 Go 结论;roundtrip 实测记录见
// bodyEditor.roundtrip.test.ts 文件头,本组件装配与其 NO_HEADING_LIST 同构,以它为契约锚)。
// md 字符串为源:content/setContent 传字符串时 tiptap-markdown 先经 markdown-it parse 成 doc,
// 取值走 editor.storage.markdown.getMarkdown(),存库前去掉恰好一个文末换行
// (仅表格块产生,与该测试 mdOfEditor 同口径)。
// schema 无 heading 无 list(spec §v1:正文无标题、列表即导图子节点):StarterKit 关节点 +
// literalBlocks 禁 markdown-it 块规则,双管齐下缺一不可(只关扩展时 `# x` 的标记字符会丢)。
// onChange 即时回调最新 md,无防抖(防抖/flush 归 Task 6 的 useBodyPanel);
// value 外部变更(切换节点)走 setContent 整体替换——Tiptap 3 的 setContent 第二参为
// options 且 emitUpdate 默认 true(v2 默认 false),必须显式传 false 防回环;
// value 与当前序列化相同则不动(doc 引用不变,选中节点反复重渲不闪不炸 undo 栈)。
// 排版样式归 Task 6 的 App.css,本组件只出最小容器类名 body-editor。
import { useEffect, useRef } from 'react'
import { Editor, Extension, type Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'

interface Props {
  /** 正文 md(存库口径:无文末换行);外部变更 → 编辑器整体替换 */
  value: string
  /** 编辑器内输入 → 即时回调最新 md(防抖归上层) */
  onChange: (md: string) => void
  /** 只读展示(默认 false) */
  readOnly?: boolean
}

// —— 禁 heading/list 装配(扩展层 + 解析层)——
const noHeadingListStarter = StarterKit.configure({
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
})
// 解析层:只关扩展节点时 `# x` 仍被 markdown-it 渲染成 <h1>,无 parseDOM 规则认领、
// 标记字符丢失;经 tiptap-markdown 的 parse.setup 钩子在 tokenize 阶段禁掉块规则,
// `#`/`-` 以字面留存(prosemirror-markdown 序列化时对行首转义,再 parse 无结构)。
const literalBlocks = Extension.create({
  name: 'literalBlocks',
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md: { disable: (rules: string[]) => unknown }) {
            md.disable(['heading', 'lheading', 'list'])
          },
        },
      },
    }
  },
})
const BODY_EXTENSIONS: Extensions = [noHeadingListStarter, TableKit, literalBlocks, Markdown]

/** 编辑器序列化为存库 md:getMarkdown 去掉恰好一个文末换行(roundtrip 实测口径) */
const mdOfEditor = (editor: Editor): string =>
  (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown
    .getMarkdown()
    .replace(/\n$/, '')

export default function BodyEditor({ value, onChange, readOnly = false }: Readonly<Props>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  // 防回环基线:最近一次外部流入的 value;update 事件序列化与之相同 → 视为外部替换的回声,不回调
  const valueRef = useRef(value)
  // onChange 经 ref 取最新,避免回调身份变化导致重订阅;readOnly 同理(建编辑器只建一次)
  const onChangeRef = useRef(onChange)
  const readOnlyRef = useRef(readOnly)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const editor = new Editor({
      // element 传 Element:tiptap 将视图 dom 追加为宿主子节点(destroy 时随之摘除,StrictMode 双挂安全)
      element: host,
      content: valueRef.current,
      extensions: BODY_EXTENSIONS,
      editable: !readOnlyRef.current,
      editorProps: { attributes: { 'aria-label': '节点正文' } },
    })
    editorRef.current = editor
    const handleUpdate = (): void => {
      const md = mdOfEditor(editor)
      if (md === valueRef.current) return
      onChangeRef.current(md)
    }
    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  // 只读切换:setEditable 第二参 emitUpdate 默认 true(doc 未变也发 update 事件),显式关掉防噪音
  useEffect(() => {
    editorRef.current?.setEditable(!readOnly, false)
  }, [readOnly])

  // value 外部变更:与当前序列化相同则不动;不同则整体替换且不发 update(防回环主闸)
  useEffect(() => {
    valueRef.current = value
    const editor = editorRef.current
    if (editor === null || editor.isDestroyed) return
    if (value === mdOfEditor(editor)) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [value])

  return <div ref={hostRef} data-testid="body-editor" className="body-editor" />
}
