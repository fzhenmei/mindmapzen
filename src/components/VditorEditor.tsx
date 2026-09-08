// src/components/VditorEditor.tsx —— VDitor 编辑器薄包装(2026-09-08 正文弹窗):
// mode sv 分屏(左源码右预览)、工具栏精选、lang 跟 i18next、主题跟 appStore(经
// props 注入)。受控语义:value 初值进构造;input 回调上抛 onChange(lastEmitted 防
// 受控回流回声重置光标);外部真值变化才 setValue。cache 关闭——草稿由宿主
// useBodyDialog 管理,不用 vditor 的 localStorage 草稿。卸载 destroy。
import { useEffect, useRef } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { VDITOR_CDN } from '../services/vditorPreview'

/** mermaid 围栏插入钮(vditor 无内置 mermaid 工具栏项):光标处插入模板图源 */
const MERMAID_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>'

interface Props {
  value: string
  onChange(next: string): void
  lang: 'zh_CN' | 'en_US'
  theme: 'light' | 'dark'
}

export default function VditorEditor({ value, onChange, lang, theme }: Readonly<Props>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const vdRef = useRef<Vditor | null>(null)
  // 最近一次上抛的值:滤掉受控回流的同值回声(否则 setValue 重置光标)
  const lastEmittedRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange // 渲染期同步,构造闭包恒读最新

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const vd = new Vditor(host, {
      mode: 'sv',
      lang,
      cdn: VDITOR_CDN,
      value,
      height: '100%',
      theme: theme === 'dark' ? 'dark' : 'classic',
      cache: { enable: false },
      toolbar: [
        'undo', 'redo', '|', 'headings', 'bold', 'italic', 'strike', '|',
        'quote', 'line', 'code', 'inline-code', '|', 'link', 'list', 'check', '|', 'table',
        {
          // vditor 4.0.0 类型 IMenuItem.name 必填:运行时走 Custom 类,作 data-type
          // 与 toolbar.elements 键(与内置名冲突会顶掉内置钮,用专有名 mermaid)
          name: 'mermaid',
          hotkey: '',
          tip: 'Mermaid',
          className: 'zen-vd-mermaid',
          icon: MERMAID_ICON,
          click: () => {
            vd.insertValue('```mermaid\ngraph LR\n  A --> B\n```')
          },
        },
      ],
      input: (md: string) => {
        lastEmittedRef.current = md
        onChangeRef.current(md)
      },
    })
    lastEmittedRef.current = value
    vdRef.current = vd
    return () => {
      vdRef.current = null
      vd.destroy()
    }
    // 弹窗生命周期内 lang/theme 不变(模态切不了语言/主题),重建仅防御
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value 只作初值,后续变化走下方受控 effect
  }, [lang, theme])

  // 外部真值变化(非本组件回声)→ 同步进编辑器
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    lastEmittedRef.current = value
    vdRef.current?.setValue(value)
  }, [value])

  return <div ref={hostRef} data-testid="vditor-host" className="h-full min-h-0" />
}
