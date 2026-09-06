import { motion } from 'motion/react'
import { Button } from '../components/ui/button'
import { L } from '../content'
import { fadeUp, fadeUpThenStagger, stagger } from '../lib/motion'
import { SectionHeading } from './SectionHeading'

export function Download() {
  return (
    <section id="download" className="scroll-mt-20 border-t bg-secondary/30 py-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="mx-auto max-w-5xl px-4"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            eyebrow={L.downloads.heading.eyebrow}
            title={L.downloads.heading.title}
            description={L.downloads.heading.description}
          />
        </motion.div>
        <motion.div variants={fadeUpThenStagger} className="mx-auto mt-10 max-w-xl space-y-3">
          {L.downloads.packages.map((p) => (
            <motion.div
              key={p.name}
              variants={fadeUp}
              className="flex items-center justify-between gap-4 rounded-xl border bg-card px-6 py-4 shadow-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{p.name}</div>
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {p.description} · <span className="font-mono text-xs">{p.file}</span>
                </div>
              </div>
              {/* TODO: 发布渠道定了,替换 href 为真实下载地址 */}
              <Button asChild className="shrink-0">
                <a href="#download">{L.download}</a>
              </Button>
            </motion.div>
          ))}
        </motion.div>
        <motion.p
          variants={fadeUp}
          className="mt-8 text-center font-mono text-xs text-muted-foreground"
        >
          {L.downloads.note}
        </motion.p>
      </motion.div>
    </section>
  )
}
