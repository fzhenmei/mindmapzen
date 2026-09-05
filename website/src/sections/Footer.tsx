import { motion } from 'motion/react'
import { BrandMark } from '../components/BrandMark'
import { fadeUp } from '../lib/motion'

export function Footer() {
  return (
    <motion.footer
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="border-t"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-8 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BrandMark size={16} />
          <span className="font-mono text-xs">mind-map-zen</span>
          <span>© 2026</span>
        </div>
        <p className="text-xs text-muted-foreground">
          导图引擎 simple-mind-map(MIT)· 字体 Noto Sans SC、JetBrains Mono(OFL)
        </p>
      </div>
    </motion.footer>
  )
}
