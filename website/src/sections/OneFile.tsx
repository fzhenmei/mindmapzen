import { motion } from 'motion/react'
import { L } from '../content'
import { fadeUp, fadeUpThenStagger, stagger } from '../lib/motion'
import { SectionHeading } from './SectionHeading'

export function OneFile() {
  return (
    <section id="onefile" className="scroll-mt-20 border-t bg-muted/40 py-24">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="mx-auto max-w-5xl px-4"
      >
        <motion.div variants={fadeUp}>
          <SectionHeading
            eyebrow={L.oneFile.heading.eyebrow}
            title={L.oneFile.heading.title}
            description={L.oneFile.heading.description}
          />
        </motion.div>
        <motion.dl variants={fadeUpThenStagger} className="mx-auto mt-12 max-w-2xl space-y-10">
          {L.oneFile.points.map((p) => (
            <motion.div
              key={p.mark}
              variants={fadeUp}
              className="flex flex-col gap-2 sm:flex-row sm:gap-8"
            >
              <dt className="shrink-0 font-mono text-sm text-primary sm:w-36 sm:text-right">
                {p.mark}
              </dt>
              <div>
                <dd className="font-semibold">{p.title}</dd>
                <dd className="mt-1 leading-relaxed text-muted-foreground">{p.body}</dd>
              </div>
            </motion.div>
          ))}
        </motion.dl>
      </motion.div>
    </section>
  )
}
