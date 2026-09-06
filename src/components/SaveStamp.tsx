import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/** 印记分路：保存成功（朱砂印）；复制成功三路（墨青印）——快捷键对调后 md 复制（Ctrl+C）
 *  与节点复制（Ctrl+Shift+c）按路径区分文案，导出图片复制保持泛义「已复制」。
 *  CopyStamp（贴节点上方的复制印记）共享此表；模块级仅存词典键与外观类，
 *  文案渲染期经 t() 取（editor.stamps 子域，无模块顶层词典求值） */
export const STAMPS = {
  saved: { key: 'editor.stamps.saved', cls: 'stamp-seal' },
  copied: { key: 'editor.stamps.copied', cls: 'stamp-ink' },
  'copied-md': { key: 'editor.stamps.copiedMd', cls: 'stamp-ink' },
  'copied-node': { key: 'editor.stamps.copiedNode', cls: 'stamp-ink' },
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
  const { t } = useTranslation()
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current?.(), 1200)
    return () => clearTimeout(timer)
  }, [])
  return (
    <span data-testid="save-stamp" className={`save-stamp ${STAMPS[kind].cls}`}>
      {t(STAMPS[kind].key)}
    </span>
  )
}
