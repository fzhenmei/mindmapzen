import { ArrowLeftRight, FolderTree, PenLine, Spline } from 'lucide-react'
import { motion } from 'motion/react'
import type * as React from 'react'
import { Code } from '../components/InlineCode'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { fadeUp, fadeUpThenStagger, stagger } from '../lib/motion'
import { SectionHeading } from './SectionHeading'

type Feature = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  /** [稳定 key, 内容]:静态数据,key 供列表渲染使用 */
  items: [string, React.ReactNode][]
}

/** 分组语汇沿用软件自身:导图列表叫「案头」,画布编辑叫「纸面」 */
const FEATURES: Feature[] = [
  {
    icon: FolderTree,
    title: '案头',
    description: '把导图放整齐',
    items: [
      ['tree', '目录树导航,按层过滤'],
      ['outline', '大纲预览:单击选中,双击打开'],
      ['move', '移动导图、新建目录'],
      ['file-ops', '新建、重命名、删除(进回收站)'],
    ],
  },
  {
    icon: PenLine,
    title: '纸面',
    description: '键盘流编辑',
    items: [
      [
        'tab-enter',
        <>
          <Code>Tab</Code> 建子节点,<Code>Enter</Code> 建同级
        </>,
      ],
      ['drag', '拖拽调整层级与顺序'],
      ['paste', '多行粘贴,一行一个节点'],
      ['fold', '折叠展开、缩放平移'],
    ],
  },
  {
    icon: Spline,
    title: '连线',
    description: '干净而听话',
    items: [
      [
        'link',
        <>
          <Code>[[名称]]</Code> 双链连线
        </>,
      ],
      ['clean', '画布隐藏标记,只留连线'],
      ['curve', '拖弯的曲线,重开仍在'],
      ['layouts', '导图、逻辑、组织三种布局'],
    ],
  },
  {
    icon: ArrowLeftRight,
    title: '输入输出',
    description: '进出自如',
    items: [
      [
        'import',
        <>
          导入 <Code>.xmind</Code> 与 <Code>.md</Code>
        </>,
      ],
      ['copy', '复制整图或子树 Markdown'],
      ['export', '导出 PNG、SVG'],
      ['note', '节点备注,写入引用块'],
    ],
  },
]

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
            eyebrow="## 功能"
            title="案头与纸面"
            description="软件里,导图列表叫「案头」,画布编辑叫「纸面」。一收一放,各安其位。"
          />
        </motion.div>
        <motion.div variants={fadeUpThenStagger} className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <motion.div key={f.title} variants={fadeUp}>
                <Card className="h-full gap-4 py-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {f.title}
                      <span className="font-normal text-muted-foreground">· {f.description}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5 text-sm text-muted-foreground">
                      {f.items.map(([k, item]) => (
                        <li key={k}>{item}</li>
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
