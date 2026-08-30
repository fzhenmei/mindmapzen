import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

interface Props {
  /** mermaid 源码（```mermaid 围栏内容，围栏本身不传） */
  code: string
}

/** 渲染态：lazy（库加载中）/ svg（成功）/ error（语法错，降级显示源码） */
type RenderState = { kind: 'lazy' } | { kind: 'svg'; svg: string } | { kind: 'error'; message: string }

// SVG 缓存键自增序号（模块级）：唯一即可，无需随机（Sonar S2245）
let mermaidSeq = 0

/** 渲染 mermaid 源为 SVG 字符串；加载类失败（dev 下 Vite 依赖重优化的模块图过期等
 *  基建抖动）自动重试一次，其余错误（语法等）原样抛给调用方降级 */
async function renderMermaid(code: string, theme: 'light' | 'dark'): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const mermaid = (await import('mermaid')).default
      // 显式 strict（转义输出，无脚本/事件注入面）而非依赖库默认；主题随双主题翻转
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: theme === 'dark' ? 'dark' : 'default',
      })
      // 唯一 id：mermaid 缓存按 id 存 SVG，重复 id 会命中旧图
      mermaidSeq += 1
      const { svg } = await mermaid.render(`zen-mermaid-${mermaidSeq}`, code)
      return svg
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (attempt === 0 && /dynamically imported module|Failed to fetch/.test(message)) continue
      throw new Error(message, { cause: e })
    }
  }
}

/** mermaid 渲染块（M17 备注即宿主）：MarkdownPreview 的 code 映射在遇
 *  language-mermaid 时替换为本组件。库体量大（≈1MB+），动态 import 懒加载——
 *  无 mermaid 的文档零开销。securityLevel 显式 strict（转义 SVG 输出、剥脚本与
 *  事件属性——注入 dangerouslySetInnerHTML 的安全前提）。
 *  主题跟随：晨松→default，夜航→dark；主题切换经 resolvedTheme 变化触发重渲染。
 *  语法错误降级为源码 pre 展示（AI 写错图源时保底可读）。
 *  加载类失败（Vite re-optimize 后模块图过期等基建抖动）自动重试一次 */
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
