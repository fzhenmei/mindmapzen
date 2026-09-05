import { FileText } from 'lucide-react'
import { Separator } from './ui/separator'

/** Hero 签名视觉:「画布 ⇄ 文件」双层对照。
 *  上层是导图的画布形态(右向布局 SVG),下层是同一张图的 Markdown 源码,
 *  两者节点内容严格一致——产品核心论点(每张导图就是一个 .md 文件)的直接演示。
 *  入场动画(连线描边、节点浮现)在 app.css;节点填色走主题令牌,暗色自动适配。 */

const LINKS_L1 = [
  'M136,160 C188,160 188,72 240,72',
  'M136,160 C188,160 188,160 240,160',
  'M136,160 C188,160 188,248 240,248',
]
const LINKS_L2 = [
  'M372,72 C410,72 410,46 448,46',
  'M372,72 C410,72 410,98 448,98',
  'M372,248 C410,248 410,248 448,248',
]

/** 入场时间轴偏移:等 Hero 文案交错入场(Hero.tsx,约 0.5s 演完)再起笔 */
const T = 500

function MindMapCanvas() {
  return (
    <svg
      viewBox="0 0 620 292"
      className="block w-full"
      role="img"
      aria-label="思维导图画布:根节点「周报提纲」,分出「本周进展」「数据与结论」「下周计划」三个分支"
    >
      {/* 连线(先画,压在节点下) */}
      <g fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.4">
        {LINKS_L1.map((d) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            className="mm-link"
            style={{ animationDelay: `${T + 150}ms` }}
          />
        ))}
        {LINKS_L2.map((d) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            className="mm-link"
            style={{ animationDelay: `${T + 450}ms` }}
          />
        ))}
      </g>

      {/* 根节点 */}
      <g className="mm-node" style={{ animationDelay: `${T}ms` }}>
        <rect x="24" y="136" width="112" height="48" rx="8" fill="var(--primary)" />
        <text x="36" y="160" dominantBaseline="middle" fontSize="16" fontWeight="600" fill="var(--primary-foreground)">
          周报提纲
        </text>
      </g>

      {/* 一级节点 */}
      {[
        { y: 54, label: '本周进展' },
        { y: 142, label: '数据与结论' },
        { y: 230, label: '下周计划' },
      ].map((n, i) => (
        <g key={n.label} className="mm-node" style={{ animationDelay: `${T + 300 + i * 60}ms` }}>
          <rect x="240" y={n.y} width="132" height="36" rx="7" fill="var(--card)" stroke="var(--border)" />
          <text x="252" y={n.y + 18} dominantBaseline="middle" fontSize="14" fill="var(--foreground)">
            {n.label}
          </text>
        </g>
      ))}

      {/* 二级节点 */}
      {[
        { y: 30, label: '导图引擎接入' },
        { y: 82, label: '修复连线弯曲' },
        { y: 232, label: '打磨导出' },
      ].map((n, i) => (
        <g key={n.label} className="mm-node" style={{ animationDelay: `${T + 600 + i * 60}ms` }}>
          <rect x="448" y={n.y} width="152" height="32" rx="6" fill="var(--muted)" stroke="var(--border)" />
          <text x="460" y={n.y + 16} dominantBaseline="middle" fontSize="13" fill="var(--muted-foreground)">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function MindMapSource() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* 文件名标签栏:编辑器 tab 观感,标记这是磁盘上的真实文件 */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
        <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-xs text-muted-foreground">周报提纲.md</span>
      </div>
      <pre className="px-5 py-4 font-mono text-sm leading-relaxed">
        <span className="font-medium text-primary">{'# 周报提纲'}</span>
        {'\n'}
        <span className="text-muted-foreground">-</span> 本周进展{'\n'}
        {'  '}
        <span className="text-muted-foreground">-</span> 导图引擎接入{'\n'}
        {'  '}
        <span className="text-muted-foreground">-</span> 修复连线弯曲{'\n'}
        <span className="text-muted-foreground">-</span> 数据与结论{'\n'}
        <span className="text-muted-foreground">-</span> 下周计划{'\n'}
        {'  '}
        <span className="text-muted-foreground">-</span> 打磨导出
      </pre>
    </div>
  )
}

export function MindMapFigure() {
  return (
    <figure className="mx-auto max-w-2xl">
      <div className="rounded-xl border bg-background px-5 pt-5 pb-2 shadow-sm">
        <MindMapCanvas />
      </div>
      {/* 连接符:声明两层是同一张图 */}
      <div className="flex items-center gap-3 py-3" aria-hidden="true">
        <Separator className="flex-1" />
        <span className="rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">同一张图</span>
        <Separator className="flex-1" />
      </div>
      <MindMapSource />
    </figure>
  )
}
