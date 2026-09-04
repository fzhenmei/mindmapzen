import { BrandMark } from '../components/BrandMark'
import { MindMapFigure } from '../components/MindMapFigure'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

const TRAITS = ['免费', '本地优先', '离线可用', '无账号']

export function Hero() {
  return (
    <section className="pt-20 md:pt-28">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <BrandMark size={56} className="mx-auto" />
        <h1 className="mt-8 text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl">
          每张导图,
          <br />
          就是一个 <span className="font-mono text-primary">Markdown</span> 文件
        </h1>
        <p className="mt-5 text-lg text-balance text-muted-foreground">
          本地优先的免费思维导图。画布上整理想法,文件里与 AI 对话。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <a href="#download">下载 Windows 版</a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#why">为什么做它</a>
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {TRAITS.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 pt-12 pb-24 md:pt-16">
        <MindMapFigure />
      </div>
    </section>
  )
}
