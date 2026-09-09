import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  /** 到期回调（1.2s）：印记由父组件受控卸载（同 SaveStamp/CopyStamp） */
  onDone?: () => void
}

/** 警告印记（画布居中闪现）：无目标调用正文编辑（悬停/选中皆空，2026-09-09）时的劝导
 *  反馈——替代原无关联空态弹窗。复制印记同款交互（1.2s 短窗 + 淡入 + 实底小签），配色
 *  朱砂（--destructive 警示语义，同错误横幅），无节点可锚故居中浮现。单一用途单一文案，
 *  不入 SaveStamp 的 STAMPS 表。 */
export default function WarnStamp({ onDone }: Readonly<Props>) {
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
    <span data-testid="warn-stamp" className="warn-stamp">
      {t('editor.stamps.noTarget')}
    </span>
  )
}
