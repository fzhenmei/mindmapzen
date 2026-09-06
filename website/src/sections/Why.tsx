import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import { BrandMark } from '../components/BrandMark'
import { L } from '../content'
import { fadeUp, rowIn, rowStagger, stagger } from '../lib/motion'
import { cn } from '../lib/utils'
import { SectionHeading } from './SectionHeading'

/** 调研结论来自设计文档 §1(2026-08 市面免费工具调研):每格的 ✗ 都有真实原因。
 *  转置排布:每列一个工具、mind-map-zen 居首列(青松底高亮),每行一种能力。
 *  不设 min-width——大屏 w-full 自然铺开无横向滚动,容器 overflow-x-auto 仅作窄屏兜底。
 *  文案(能力行/工具列/不满足原因)在 content/zh.ts 的 why 域。 */

type Cell = true | string // true = 满足;string = 不满足的原因

function MarkCell({ cell }: { readonly cell: Cell }) {
  if (cell === true) {
    return <Check className="mx-auto size-4 text-primary" aria-label={L.why.ariaYes} />
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <X className="size-4 text-muted-foreground/50" aria-label={L.why.ariaNo} />
      <span className="text-xs leading-tight text-muted-foreground">{cell}</span>
    </div>
  )
}

export function Why() {
  return (
    <section id="why" className="scroll-mt-20 py-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="mx-auto max-w-5xl px-4"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            eyebrow={L.why.heading.eyebrow}
            title={L.why.heading.title}
            description={L.why.heading.description}
          />
        </motion.div>
        <motion.div
          variants={fadeUp}
          className="mt-10 overflow-x-auto rounded-xl border bg-card shadow-sm"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-3" aria-label={L.why.ariaAbility} />
                {L.why.tools.map((tool) => (
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
            <motion.tbody variants={rowStagger}>
              {L.why.abilities.map((ability, i) => (
                <motion.tr key={ability} variants={rowIn} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="px-3 py-3 text-left font-normal text-muted-foreground whitespace-nowrap"
                  >
                    {ability}
                  </th>
                  {L.why.tools.map((tool) => (
                    <td
                      key={tool.name}
                      className={cn('px-2 py-3 text-center', tool.self && 'bg-secondary/50')}
                    >
                      <MarkCell cell={tool.cells[i]} />
                    </td>
                  ))}
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </motion.div>
        <motion.p
          variants={fadeUp}
          className="mx-auto mt-10 max-w-2xl text-center text-balance text-muted-foreground"
        >
          {L.why.closing}
        </motion.p>
      </motion.div>
    </section>
  )
}
