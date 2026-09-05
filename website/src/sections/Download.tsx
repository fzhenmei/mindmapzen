import { motion } from 'motion/react'
import { Button } from '../components/ui/button'
import { fadeUp, fadeUpThenStagger, stagger } from '../lib/motion'
import { SectionHeading } from './SectionHeading'

type Package = { name: string; description: string; file: string }

const PACKAGES: Package[] = [
  { name: 'MSI 安装包', description: 'Windows 标准安装格式,推荐', file: 'mind-map-zen.msi' },
  { name: 'NSIS 安装包', description: '轻量安装器,安装更快', file: 'mind-map-zen-setup.exe' },
  { name: '免安装版', description: '单个可执行文件,下载即用', file: 'mind-map-zen.exe' },
]

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
            eyebrow="## 下载"
            title="装上就用"
            description="免费,无账号,无导图数量限制。所有文件都保存在你自己的工作区文件夹里。"
          />
        </motion.div>
        <motion.div variants={fadeUpThenStagger} className="mx-auto mt-10 max-w-xl space-y-3">
          {PACKAGES.map((p) => (
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
                <a href="#download">下载</a>
              </Button>
            </motion.div>
          ))}
        </motion.div>
        <motion.p
          variants={fadeUp}
          className="mt-8 text-center font-mono text-xs text-muted-foreground"
        >
          v2.9.0 · Windows 10 及以上
        </motion.p>
      </motion.div>
    </section>
  )
}
