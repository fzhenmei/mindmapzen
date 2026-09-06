// src/components/EditorCaption.tsx —— 题签与主题钮容器（M5a 拆分自 EditorView；M12b Task 4 青松换肤）：
// 左下题签 = 等宽文件声道导图名 + 有未保存修改时缀朱砂脏印（spec §3 纸面）+
// 基本信息统计（2026-09：节点数 + 最后保存时间，并入题签行不加新浮层）；
// 复制文件路径钮初版曾挂此处，后移砚栏复制钮旁（IconRoute 图标区分）；
// 右下 theme-fab 定位容器 2026-09 抽至 ThemeToggle.ThemeFab（开屏/案头/纸面三态统一）。
// editor-caption/caption-name/theme-fab 类名保留为视觉冒烟钩子（skin 已转 utility，App.css 无对应规则）。
import { useTranslation } from 'react-i18next'
import { i18n } from '../i18n'
import { ThemeFab } from './ThemeToggle'

interface Props {
  /** 导图名（EditorView 取自 mdPath 文件名，去 .md 扩展） */
  name: string
  /** 有未保存修改（true 时缀朱砂脏印） */
  dirty: boolean
  /** 节点总数（EditorView 自引擎树计数，data_change 时刷新） */
  nodeCount: number
  /** 最后一次落盘时刻（ms）：打开初值取文件 mtime，会话内保存成功后刷新 */
  savedAt: number | null
}

/** 保存时间人性化（渲染期调用，locale 随界面语言——同 HistoryDialog.fmtDate 先例）：
 *  null=未保存（防御态，词典取值）；今天只显 HH:mm；更早补日期前缀 MM-DD（连字符分隔） */
function savedTimeLabel(ms: number | null): string {
  if (ms === null) return i18n.t('editor.caption.unsaved')
  const d = new Date(ms)
  const now = new Date()
  const hm = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return hm
  const md = new Intl.DateTimeFormat(i18n.language, { month: '2-digit', day: '2-digit' })
    .formatToParts(d)
    .filter((p) => p.type === 'month' || p.type === 'day')
    .map((p) => p.value)
    .join('-')
  return `${md} ${hm}`
}

/** 左下等宽题签 + 朱砂脏印 + 统计行；右下主题钮容器（testid/类名钩子不变，皮肤转 utility）。
 *  窄窗避让（2026-09 UI 评审 P1）：ZenBar 固定 ~778px 居中，窗口 <1150px 时题签（本组件）
 *  与主题钮（ThemeFab）上移一行（bottom-16）与之分层；长名经 max-w（calc(50%-27rem)，
 *  0 下限防负值）截断，宽窗下也不越进命令栏。容器 = .editor 的 @container（EditorView） */
export default function EditorCaption({ name, dirty, nodeCount, savedAt }: Readonly<Props>) {
  const { t } = useTranslation()
  return (
    <>
      <div className="editor-caption pointer-events-none absolute bottom-3 left-4 z-[5] flex max-w-[max(0px,calc(50%-27rem))] items-center gap-2 text-sm text-muted-foreground @max-[1150px]:bottom-16">
        <span className="caption-name min-w-0 max-w-[40vw] truncate font-mono">{name}</span>
        {dirty && (
          /* aria-live：朱砂点出现/消失时向读屏播报（色点本身无文本，aria-label 提供语义） */
          <span role="status" aria-live="polite">
            <span
              data-testid="dirty-badge"
              title={t('editor.caption.dirtyBadge')}
              aria-label={t('editor.caption.dirtyBadge')}
              className="inline-block size-2 rounded-[2px] bg-destructive"
            />
          </span>
        )}
        {/* 统计行（2026-09）：节点数 + 最后保存时间，muted 小字不抢题签（shrink-0 长名截断不让位） */}
        <span data-testid="caption-stats" className="shrink-0 whitespace-nowrap font-mono text-xs">
          {t('editor.caption.stats', { count: nodeCount, savedAt: savedTimeLabel(savedAt) })}
        </span>
      </div>
      <ThemeFab className="@max-[1150px]:bottom-16" />
    </>
  )
}
