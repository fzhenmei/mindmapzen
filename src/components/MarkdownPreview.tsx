import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stripMarkers } from '../services/linkMarkers'

interface Props {
  /** 导图 md 原文（渲染前逐行过 stripMarkers——[[..]] 连线标记与画布显示层同口径隐藏） */
  text: string
}

/** markdown 预览（M15 文件详情态下层）：react-markdown + remark-gfm 渲染真实 md；
 *  样式全走令牌（元素映射 className，无第三方排版插件），引用块（节点备注）=
 *  muted 色块 + 青松左条——延续「去黑线」口径，语义装饰色非分区线 */
export default function MarkdownPreview({ text }: Readonly<Props>) {
  // 连线标记按行剥离（标记永不跨行，与序列化口径一致）
  const display = text
    .split('\n')
    .map((l) => stripMarkers(l))
    .join('\n')
  return (
    <div data-testid="md-preview" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-xl font-semibold tracking-tight" {...p} />,
          h2: (p) => <h2 className="mt-5 text-lg font-semibold tracking-tight" {...p} />,
          h3: (p) => <h3 className="mt-4 text-base font-semibold" {...p} />,
          h4: (p) => <h4 className="mt-3 text-sm font-semibold" {...p} />,
          h5: (p) => <h5 className="mt-3 text-sm font-semibold" {...p} />,
          h6: (p) => <h6 className="mt-3 text-sm font-semibold text-muted-foreground" {...p} />,
          p: (p) => <p className="text-sm leading-relaxed" {...p} />,
          blockquote: (p) => (
            <blockquote
              className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/60 px-3 py-1.5 text-sm text-muted-foreground"
              {...p}
            />
          ),
          ul: (p) => <ul className="mt-2 list-disc space-y-1 pl-6 text-sm" {...p} />,
          ol: (p) => <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          a: (p) => <a className="text-primary underline underline-offset-2" {...p} />,
          hr: () => <hr className="my-4 border-border/60" />,
          code: (p) => <code className="rounded bg-muted px-1 py-0.5 font-file text-xs" {...p} />,
          pre: (p) => (
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-file text-xs leading-6" {...p} />
          ),
          table: (p) => <table className="mt-2 w-full text-sm" {...p} />,
          th: (p) => <th className="border-b border-border/60 px-2 py-1 text-left font-medium" {...p} />,
          td: (p) => <td className="border-b border-border/40 px-2 py-1" {...p} />,
        }}
      >
        {display}
      </ReactMarkdown>
    </div>
  )
}
