import type { OutlineHeading } from '../services/mdOutline'

interface Props {
  /** md 标题列表（mdOutline 产出，文档序） */
  headings: OutlineHeading[]
}

/** 预览大纲面板（2026-09）：md 标题层级树导航，条目点击滚动定位正文锚点
 *  （id 由 MarkdownPreview 按 mdOutline 同源序号注入）；层级按 depth 渐进缩进。
 *  bg-card 上浮于 bg-muted 预览底（与备注块换肤同口径），w-56 右侧栏自滚动 */
export default function OutlinePanel({ headings }: Readonly<Props>) {
  return (
    <aside
      data-testid="outline-panel"
      className="w-56 shrink-0 overflow-y-auto border-l border-border/60 bg-card px-2 py-4"
    >
      <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground">大纲</p>
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
  )
}
