import { ArrowLeftRight, ArrowUp, Copy, FileText, Sparkles } from 'lucide-react'
import type * as React from 'react'
import { Separator } from './ui/separator'

/** Hero 签名视觉:「画布 → 文件 → AI」三层叙事。
 *  上层是导图的画布形态(右向布局 SVG),中层是同一张图的 Markdown 源码,
 *  下层是把大纲粘贴进 AI 对话框的输入态——产品核心工作流的直接演示:
 *  画布上整理还没做的点子,Ctrl+C 复制 Markdown,交给 AI 帮助实现。
 *  画布与文件两层节点内容严格一致(每张导图就是一个 .md 文件)。
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
      aria-label="思维导图画布:根节点「桌面番茄钟」,分出「核心功能」「界面与交互」「待定」三个分支"
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
          桌面番茄钟
        </text>
      </g>

      {/* 一级节点 */}
      {[
        { y: 54, label: '核心功能' },
        { y: 142, label: '界面与交互' },
        { y: 230, label: '待定' },
      ].map((n, i) => (
        <g key={n.label} className="mm-node" style={{ animationDelay: `${T + 300 + i * 60}ms` }}>
          <rect x="240" y={n.y} width="132" height="36" rx="7" fill="var(--card)" stroke="var(--border)" />
          <text x="252" y={n.y + 18} dominantBaseline="middle" fontSize="14" fill="var(--foreground)">
            {n.label}
          </text>
        </g>
      ))}

      {/* 二级节点:「待定 → 要不要统计?」是进行中的思路,不是工作记录 */}
      {[
        { y: 30, label: '25 分钟专注循环' },
        { y: 82, label: '休息提醒' },
        { y: 232, label: '要不要统计？' },
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
        <span className="font-mono text-xs text-muted-foreground">桌面番茄钟.md</span>
      </div>
      <pre className="px-5 py-4 font-mono text-sm leading-relaxed">
        <span className="font-medium text-primary">{'# 桌面番茄钟'}</span>
        {'\n'}
        <span className="text-muted-foreground">-</span> 核心功能{'\n'}
        {'  '}
        <span className="text-muted-foreground">-</span> 25 分钟专注循环{'\n'}
        {'  '}
        <span className="text-muted-foreground">-</span> 休息提醒{'\n'}
        <span className="text-muted-foreground">-</span> 界面与交互{'\n'}
        <span className="text-muted-foreground">-</span> 待定{'\n'}
        {'  '}
        <span className="text-muted-foreground">-</span> 要不要统计？
      </pre>
    </div>
  )
}

function AiComposer() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* 标签栏与文件层同构:任意 AI 对话框,不指向具体产品 */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
        <Sparkles className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-xs text-muted-foreground">AI 对话框</span>
      </div>
      <div className="px-5 py-4">
        {/* 粘贴进来的大纲:Ctrl+C 的产物,淡化以示同一份内容 */}
        <pre className="font-mono text-xs leading-relaxed text-muted-foreground/70">
          {'# 桌面番茄钟'}
          {'\n'}
          {'- 核心功能 …'}
        </pre>
        {/* 指令行:唯一高亮的一句,Enter 待发 */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-sm">照这个大纲,帮我实现 V1</span>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  )
}

/** 分隔连接符:两条横线夹一枚胶囊,声明相邻两层的关系 */
function LayerLink({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3" aria-hidden="true">
      <Separator className="flex-1" />
      <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
        {children}
      </span>
      <Separator className="flex-1" />
    </div>
  )
}

export function MindMapFigure() {
  return (
    <figure className="mx-auto max-w-2xl">
      <div className="rounded-xl border bg-background px-5 pt-5 pb-2 shadow-sm">
        <MindMapCanvas />
      </div>
      <LayerLink>
        <ArrowLeftRight className="size-3" aria-hidden="true" />
        双向同步
      </LayerLink>
      <MindMapSource />
      <LayerLink>
        <Copy className="size-3" aria-hidden="true" />
        Ctrl+C 复制
      </LayerLink>
      <AiComposer />
    </figure>
  )
}
