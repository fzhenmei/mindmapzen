import { Check, X } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { SectionHeading } from './SectionHeading'

/** 调研结论来自设计文档 §1(2026-08 市面免费工具调研):每行的 ✗ 都有真实原因 */
const COLUMNS = ['工具', '自由画布', '中文体验', '免费无限制', 'Markdown 读写', '桌面离线']

type Cell = true | string // true = 满足;string = 不满足的原因

const ROWS: { name: string; self?: boolean; cells: Cell[] }[] = [
  { name: 'XMind', cells: [true, true, '免费版限制', '导出付费', true] },
  { name: 'Freeplane', cells: [true, '中文体验差', true, true, true] },
  { name: '幕布', cells: ['大纲式,无画布', true, true, '不支持导出', true] },
  { name: 'Markmap 系', cells: ['仅自动布局', true, true, true, true] },
  { name: 'mind-map-zen', self: true, cells: [true, true, true, true, true] },
]

function MarkCell({ cell }: { cell: Cell }) {
  if (cell === true) {
    return (
      <Check className="mx-auto size-4 text-primary" aria-label="满足" />
    )
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <X className="size-4 text-muted-foreground/50" aria-label="不满足" />
      <span className="text-xs leading-none text-muted-foreground">{cell}</span>
    </div>
  )
}

export function Why() {
  return (
    <section id="why" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-5xl px-4">
        <SectionHeading
          eyebrow="## 为什么"
          title="找不到,就自己写一个"
          description="用导图整理想法、再转成 Markdown 喂给 AI,是每周都在重复的工作流。找遍市面工具,没有一个同时做到这几件事:"
        />
        <div className="mt-10 overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-540 text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                {COLUMNS.map((col) => (
                  <th key={col} className="px-4 py-3 text-center font-medium first:text-left">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.name}
                  className={
                    row.self
                      ? 'border-b border-t bg-secondary/50 last:border-b-0'
                      : 'border-b last:border-b-0'
                  }
                >
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-2 ${row.self ? 'font-medium' : ''}`}>
                      {row.self && <BrandMark size={16} />}
                      {row.self ? <span className="font-mono text-[13px]">{row.name}</span> : row.name}
                    </span>
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-4 py-3 text-center">
                      <MarkCell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-balance text-muted-foreground">
          Markdown 是与 AI 交流的通用语——它不该藏在导图软件的「导出为…」菜单里,
          它应该就是导图本身。
        </p>
      </div>
    </section>
  )
}
