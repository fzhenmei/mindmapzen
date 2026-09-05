import { Check, X } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { cn } from '../lib/utils'
import { SectionHeading } from './SectionHeading'

/** 调研结论来自设计文档 §1(2026-08 市面免费工具调研):每格的 ✗ 都有真实原因。
 *  转置排布:每列一个工具、mind-map-zen 居首列(青松底高亮),每行一种能力。
 *  不设 min-width——大屏 w-full 自然铺开无横向滚动,容器 overflow-x-auto 仅作窄屏兜底。 */
const ABILITIES = ['自由画布', '中文体验', '免费无限制', 'Markdown 读写', '桌面离线']

type Cell = true | string // true = 满足;string = 不满足的原因

const TOOLS: { name: string; self?: boolean; cells: Cell[] }[] = [
  { name: 'mind-map-zen', self: true, cells: [true, true, true, true, true] },
  { name: 'XMind', cells: [true, true, '免费版限制', '导出付费', true] },
  { name: 'Freeplane', cells: [true, '中文体验差', true, true, true] },
  { name: '幕布', cells: ['大纲式,无画布', true, true, '不支持导出', true] },
  { name: 'Markmap 系', cells: ['仅自动布局', true, true, true, true] },
]

function MarkCell({ cell }: { readonly cell: Cell }) {
  if (cell === true) {
    return <Check className="mx-auto size-4 text-primary" aria-label="满足" />
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <X className="size-4 text-muted-foreground/50" aria-label="不满足" />
      <span className="text-xs leading-tight text-muted-foreground">{cell}</span>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-3" aria-label="能力" />
                {TOOLS.map((tool) => (
                  <th
                    key={tool.name}
                    className={cn(
                      'px-2 py-3 text-center font-medium whitespace-nowrap',
                      tool.self && 'bg-secondary/50',
                    )}
                  >
                    {tool.self ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[13px] text-foreground">
                        <BrandMark size={14} />
                        {tool.name}
                      </span>
                    ) : (
                      tool.name
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ABILITIES.map((ability, i) => (
                <tr key={ability} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="px-3 py-3 text-left font-normal text-muted-foreground whitespace-nowrap"
                  >
                    {ability}
                  </th>
                  {TOOLS.map((tool) => (
                    <td
                      key={tool.name}
                      className={cn('px-2 py-3 text-center', tool.self && 'bg-secondary/50')}
                    >
                      <MarkCell cell={tool.cells[i]} />
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
