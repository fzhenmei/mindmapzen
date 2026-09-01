import { useEffect, useRef } from 'react'

/** 印记分路：保存成功（朱砂印）；复制成功三路（墨青印）——快捷键对调后 md 复制（Ctrl+C）
 *  与节点复制（Ctrl+Shift+c）按路径区分文案，导出图片复制保持泛义「已复制」 */
const STAMPS = {
  saved: { text: '已存', cls: 'stamp-seal' },
  copied: { text: '已复制', cls: 'stamp-ink' },
  'copied-md': { text: '已复制为 Markdown', cls: 'stamp-ink' },
  'copied-node': { text: '已复制为节点', cls: 'stamp-ink' },
} as const

export type StampKind = keyof typeof STAMPS

interface Props {
  kind: StampKind
  /** 到期回调（1.2s）：印记由父组件受控卸载（组件自身不隐藏） */
  onDone?: () => void
}

/** 印记：保存成功（朱砂印）/复制成功（墨青印），250ms 缩放定影，1.2s 后回调 onDone 交父卸载。
 *  到期计时自挂载起算，不因父重渲染换 onDone 引用而重置（latest-ref）；
 *  同会话重复盖印由父以新 key（seq）重挂载实现 */
export default function SaveStamp({ kind, onDone }: Readonly<Props>) {
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current?.(), 1200)
    return () => clearTimeout(t)
  }, [])
  return (
    <span data-testid="save-stamp" className={`save-stamp ${STAMPS[kind].cls}`}>
      {STAMPS[kind].text}
    </span>
  )
}
