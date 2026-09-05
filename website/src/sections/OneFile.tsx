import { motion } from 'motion/react'
import { fadeUp, fadeUpThenStagger, stagger } from '../lib/motion'
import { SectionHeading } from './SectionHeading'

const POINTS = [
  {
    mark: '.md',
    title: '唯一事实源',
    body: '导图内容以 Markdown 大纲存盘。AI、grep、git 都能直接读,不经过任何导出步骤。',
  },
  {
    mark: '⇄',
    title: '双向同步',
    body: '自由修改导图,文件随保存自动更新;也可以相反——直接改文件,或让 AI 改,重新打开导图即是最新。',
  },
  {
    mark: 'Ctrl+C',
    title: '一键喂给 AI',
    body: '选中节点复制,粘贴进任意 AI 对话框就是 Markdown 大纲,没有「导出」这一步;也可以只复制一个子树。',
  },
  {
    mark: 'git',
    title: '内置版本历史',
    body: '工作区自动 git 备份,每次改动都有版本,随时回滚——回滚本身也能再回滚。',
  },
]

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
            eyebrow="[[ 一图一文件 ]]"
            title="导图,即文本"
            description="一张导图在磁盘上就是一个 Markdown 文件。内容属于你,不锁在软件里。"
          />
        </motion.div>
        <motion.dl variants={fadeUpThenStagger} className="mx-auto mt-12 max-w-2xl space-y-10">
          {POINTS.map((p) => (
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
