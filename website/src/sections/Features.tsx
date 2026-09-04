import { ArrowLeftRight, FolderTree, PenLine, Spline } from 'lucide-react'
import type * as React from 'react'
import { Code } from '../components/InlineCode'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { SectionHeading } from './SectionHeading'

type Feature = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  items: React.ReactNode[]
}

/** 分组语汇沿用软件自身:导图列表叫「案头」,画布编辑叫「纸面」 */
const FEATURES: Feature[] = [
  {
    icon: FolderTree,
    title: '案头',
    description: '把导图放整齐',
    items: [
      '目录树导航,按层过滤',
      '大纲预览:单击选中,双击打开',
      '移动导图、新建目录',
      '新建、重命名、删除(进回收站)',
    ],
  },
  {
    icon: PenLine,
    title: '纸面',
    description: '键盘流编辑',
    items: [
      <>
        <Code>Tab</Code> 建子节点,<Code>Enter</Code> 建同级
      </>,
      '拖拽调整层级与顺序',
      '多行粘贴,一行一个节点',
      '折叠展开、缩放平移',
    ],
  },
  {
    icon: Spline,
    title: '连线',
    description: '干净而听话',
    items: [
      <>
        <Code>[[名称]]</Code> 双链连线
      </>,
      '画布隐藏标记,只留连线',
      '拖弯的曲线,重开仍在',
      '导图、逻辑、组织三种布局',
    ],
  },
  {
    icon: ArrowLeftRight,
    title: '输入输出',
    description: '进出自如',
    items: [
      <>
        导入 <Code>.xmind</Code> 与 <Code>.md</Code>
      </>,
      '复制整图或子树 Markdown',
      '导出 PNG、SVG',
      '节点备注,写入引用块',
    ],
  },
]

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-5xl px-4">
        <SectionHeading
          eyebrow="## 功能"
          title="案头与纸面"
          description="软件里,导图列表叫「案头」,画布编辑叫「纸面」。一收一放,各安其位。"
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <Card key={f.title} className="gap-4 py-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {f.title}
                    <span className="font-normal text-muted-foreground">· {f.description}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5 text-sm text-muted-foreground">
                    {f.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
