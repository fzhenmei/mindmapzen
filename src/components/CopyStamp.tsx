import { useEffect, useRef } from 'react'
import { STAMPS } from './SaveStamp'

interface Props {
  kind: 'copied-md' | 'copied-node'
  /** 锚点（computeNodeStampPos 产出，.editor 容器像素）：印记下缘中点贴节点上边中点上方 */
  pos: { left: number; top: number }
  /** 到期回调（1.2s）：印记由父组件受控卸载（同 SaveStamp） */
  onDone?: () => void
}

/** 复制印记（贴目标节点闪现）：Ctrl+C 复制 md / Ctrl+Shift+c 复制节点成功后盖在目标节点
 *  上方居中（选中节点；整图复制锚根节点）——右上角 SaveStamp 对画布内高频操作不可见
 *  （视线在操作处）。文案与墨青外观复用 SaveStamp 的 STAMPS 表；定位与淡入自带
 *  （stamp-in 的 transform 动画会覆盖 translate 锚定，故独立 copy-in 纯淡入）。 */
export default function CopyStamp({ kind, pos, onDone }: Readonly<Props>) {
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
      data-testid="copy-stamp"
      className={`copy-stamp ${STAMPS[kind].cls}`}
      style={{ left: pos.left, top: pos.top }}
    >
      {STAMPS[kind].text}
    </span>
  )
}
