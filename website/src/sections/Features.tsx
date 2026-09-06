import { ArrowLeftRight, FolderTree, PenLine, Spline } from 'lucide-react'
import { motion } from 'motion/react'
import { Code } from '../components/InlineCode'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { L } from '../content'
import { fadeUp, fadeUpThenStagger, stagger } from '../lib/motion'
import { SectionHeading } from './SectionHeading'

/** 分组语汇沿用软件自身:导图列表叫「案头」,画布编辑叫「纸面」;
 *  分组文案在 content/zh.ts 的 features 域,图标留在组件按 key 一一对应 */
const GROUP_ICONS = {
  desk: FolderTree,
  paper: PenLine,
  link: Spline,
  io: ArrowLeftRight,
} as const

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="mx-auto max-w-5xl px-4"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            eyebrow={L.features.heading.eyebrow}
            title={L.features.heading.title}
            description={L.features.heading.description}
          />
        </motion.div>
        <motion.div variants={fadeUpThenStagger} className="mt-10 grid gap-4 sm:grid-cols-2">
          {L.features.groups.map((g) => {
            const Icon = GROUP_ICONS[g.key]
            return (
              <motion.div key={g.key} variants={fadeUp}>
                <Card className="h-full gap-4 py-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {g.title}
                      <span className="font-normal text-muted-foreground">· {g.description}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5 text-sm text-muted-foreground">
                      {g.items.map(([k, segs]) => (
                        <li key={k}>
                          {segs.map((s, i) =>
                            typeof s === 'string' ? s : <Code key={i}>{s.code}</Code>,
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      </motion.div>
    </section>
  )
}
