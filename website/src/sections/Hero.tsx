import { motion } from 'motion/react'
import { BrandMark } from '../components/BrandMark'
import { MindMapFigure } from '../components/MindMapFigure'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { fadeUp, stagger } from '../lib/motion'

const TRAITS = ['免费', '本地优先', '离线可用', '无账号']

/** 首屏在视口内,whileInView 加载即触发:文案 5 步交错入场;
 *  导图块固定延迟 0.5s 跟进,与其内部 CSS 动画(MindMapFigure 已同步偏移)衔接成一条时间轴。 */
export function Hero() {
  return (
    <section className="pt-20 md:pt-28">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mx-auto max-w-3xl px-4 text-center"
      >
        <motion.div variants={fadeUp}>
          <BrandMark size={56} className="mx-auto" />
        </motion.div>
        <motion.h1
          variants={fadeUp}
          className="mt-8 text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl"
        >
          每张导图,
          <br />
          就是一个 <span className="font-mono text-primary">Markdown</span> 文件
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-5 text-lg text-balance text-muted-foreground">
          本地优先的免费思维导图。画布上整理想法,文件里与 AI 对话。
        </motion.p>
        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <a href="#download">下载 Windows 版</a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#why">为什么做它</a>
          </Button>
        </motion.div>
        <motion.div variants={fadeUp} className="mt-6 flex flex-wrap justify-center gap-2">
          {TRAITS.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </motion.div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl px-4 pt-12 pb-24 md:pt-16"
      >
        <MindMapFigure />
      </motion.div>
    </section>
  )
}
