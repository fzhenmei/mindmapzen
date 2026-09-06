import { motion } from 'motion/react'
import { BrandMark } from '../components/BrandMark'
import { L } from '../content'
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
          <span>{L.footer.copyright}</span>
        </div>
        <p className="text-xs text-muted-foreground">{L.footer.credits}</p>
      </div>
    </motion.footer>
  )
}
