import { useEffect, useRef } from 'react'

interface Props {
  kind: 'saved' | 'copied'
  /** 到期回调（1.2s）：印记由父组件受控卸载（组件自身不隐藏） */
  onDone?: () => void
}

/** 印记：保存成功（朱砂印）/已复制（墨青印），250ms 缩放定影，1.2s 后回调 onDone 交父卸载。
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
    <span
      data-testid="save-stamp"
      className={`save-stamp ${kind === 'saved' ? 'stamp-seal' : 'stamp-ink'}`}
    >
      {kind === 'saved' ? '已存' : '已复制'}
    </span>
  )
}
