import { SectionHeading } from './SectionHeading'

const POINTS = [
  {
    mark: '.md',
    title: '唯一事实源',
    body: '导图内容以 Markdown 大纲存盘。AI、grep、git 都能直接读,不经过任何导出步骤。',
  },
  {
    mark: '.zen.json',
    title: '只管布局',
    body: '节点位置与折叠状态记在伴生文件里。它丢了、删了,导图自动重排,内容分毫不损。',
  },
  {
    mark: 'Ctrl+Shift+C',
    title: '一键喂给 AI',
    body: '复制整图 Markdown 到剪贴板,粘贴进任意 AI 对话框;也可以只复制一个子树。',
  },
]

export function OneFile() {
  return (
    <section id="onefile" className="scroll-mt-20 border-t bg-muted/40 py-24">
      <div className="mx-auto max-w-5xl px-4">
        <SectionHeading
          eyebrow="[[ 一图一文件 ]]"
          title="导图,即文本"
          description="一张导图在磁盘上就是一对文件:一个存内容,一个存布局。内容属于你,布局只是备忘。"
        />
        <dl className="mx-auto mt-12 max-w-2xl space-y-10">
          {POINTS.map((p) => (
            <div key={p.mark} className="flex flex-col gap-2 sm:flex-row sm:gap-8">
              <dt className="shrink-0 font-mono text-sm text-primary sm:w-36 sm:text-right">
                {p.mark}
              </dt>
              <div>
                <dd className="font-semibold">{p.title}</dd>
                <dd className="mt-1 leading-relaxed text-muted-foreground">{p.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
