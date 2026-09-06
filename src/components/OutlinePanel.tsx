import { useTranslation } from 'react-i18next'
import type { OutlineHeading } from '../services/mdOutline'
import SplitResizer from './SplitResizer'

interface Props {
  /** md 标题列表（mdOutline 产出，文档序） */
  headings: OutlineHeading[]
  /** 面板宽（px，已含默认回退）：拖拽中/持久值由 FileDetail 统一归一后传入 */
  width: number
  onResize: (w: number) => void
  onCommit: (w: number) => void
  onReset: () => void
}

/** 预览大纲面板（2026-09）：md 标题层级树导航，条目点击滚动定位正文锚点
 *  （id 由 MarkdownPreview 按 mdOutline 同源序号注入）；层级按 depth 渐进缩进。
 *  bg-card 上浮于 bg-muted 预览底（与备注块换肤同口径），自滚动。宽 2026-09 起可拖：
 *  外层定位壳承担 width 与左缘手柄（absolute 不随内层滚动滚走），内层 aside 滚动 */
export default function OutlinePanel({ headings, width, onResize, onCommit, onReset }: Readonly<Props>) {
  const { t } = useTranslation()
  return (
    <div data-testid="outline-panel" className="relative shrink-0" style={{ width: `${width}px` }}>
      <SplitResizer
        side="left"
        width={width}
        min={160}
        // 上限取 min(400px, 40vw)：窄窗下大纲不吞没正文
        max={Math.min(400, Math.round(window.innerWidth * 0.4))}
        label={t('editor.outline.resizeLabel')}
        onResize={onResize}
        onCommit={onCommit}
        onReset={onReset}
      />
      <aside
        className="h-full w-full overflow-y-auto border-l border-border/60 bg-card px-2 py-4"
      >
        <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground">{t('editor.outline.title')}</p>
        {headings.map((h) => (
          <button
            key={h.id}
            type="button"
            data-testid={`outline-${h.id}`}
            className="block w-full truncate rounded px-2 py-1 text-left text-xs leading-5 text-foreground/80 hover:bg-foreground/10 hover:text-foreground"
            style={{ paddingLeft: 8 + (h.depth - 1) * 12 }}
            onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' })}
          >
            {h.text}
          </button>
        ))}
      </aside>
    </div>
  )
}
