import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { renderMermaid } from '../services/mermaidRender'

interface Props {
  /** mermaid 源码（```mermaid 围栏内容，围栏本身不传） */
  code: string
}

/** 渲染态：lazy（库加载中）/ svg（成功）/ error（语法错，降级显示源码） */
type RenderState = { kind: 'lazy' } | { kind: 'svg'; svg: string } | { kind: 'error'; message: string }

/** mermaid 渲染块（M17 备注即宿主）：MarkdownPreview 的 code 映射在遇
 *  language-mermaid 时替换为本组件。渲染走共享 renderMermaid（懒加载/strict
 *  转义 SVG/主题跟随/加载失败重试，见 services/mermaidRender.ts——画布备注悬停窗
 *  同源复用）。语法错误降级为源码 pre 展示（AI 写错图源时保底可读） */
export default function MermaidBlock({ code }: Readonly<Props>) {
  const theme = useAppStore((s) => s.resolvedTheme)
  const [state, setState] = useState<RenderState>({ kind: 'lazy' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'lazy' })
    void renderMermaid(code, theme)
      .then((svg) => {
        if (!cancelled) setState({ kind: 'svg', svg })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [code, theme])

  if (state.kind === 'lazy')
    return (
      <pre data-testid="mermaid-lazy" className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-file text-xs leading-6 text-muted-foreground">
        {code}
      </pre>
    )
  if (state.kind === 'error')
    return (
      // 语法错误降级：源码保底可读 + 错误摘要（AI 写错图源时的调试线索）
      <pre data-testid="mermaid-error" className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-file text-xs leading-6">
        <span className="text-destructive">{state.message.split('\n')[0]}</span>
        {'\n'}
        {code}
      </pre>
    )
  return (
    // mermaid strict 模式输出为转义 SVG（安全前提见组件头注释），注入即渲染；居中收边
    <div
      data-testid="mermaid-svg"
      className="mermaid-host mt-2 flex justify-center overflow-x-auto rounded-md bg-card px-3 py-2 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}
