import { useEffect, useMemo, useRef, type ComponentProps, type ReactElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stripMarkers } from '../services/linkMarkers'
import { stripIconMarkers } from '../services/iconMarkers'
import { stripTagMarkers } from '../services/tagMarkers'
import MermaidBlock from './MermaidBlock'

/** 元素映射（模块级常量，S6478：不在组件内定义）：全走令牌类名，无第三方排版插件。
 *  层级视觉（M15 验收）：导图 md 的标题层级即树——字号阶梯拉开（24/20/16/14/13/12px）
 *  + 逐级缩进（H3 起 12px/级）+ 末级降灰，结构一眼可读。
 *  每映射显式解构 node（react-markdown 内部属性不得透传 DOM）与 children（显式 JSX 子
 *  内容，可达性）；引用块（节点备注）= muted 色块 + 青松左条（语义装饰非分区线） */
const MD_COMPONENTS: Components = {
  h1: ({ node: _node, children, ...p }) => (
    <h1 className="text-2xl font-semibold tracking-tight" {...p}>
      {children}
    </h1>
  ),
  h2: ({ node: _node, children, ...p }) => (
    <h2 className="mt-5 text-xl font-semibold tracking-tight" {...p}>
      {children}
    </h2>
  ),
  h3: ({ node: _node, children, ...p }) => (
    <h3 className="mt-4 pl-3 text-base font-semibold" {...p}>
      {children}
    </h3>
  ),
  h4: ({ node: _node, children, ...p }) => (
    <h4 className="mt-3 pl-6 text-sm font-semibold" {...p}>
      {children}
    </h4>
  ),
  h5: ({ node: _node, children, ...p }) => (
    <h5 className="mt-3 pl-9 text-[13px] font-semibold" {...p}>
      {children}
    </h5>
  ),
  h6: ({ node: _node, children, ...p }) => (
    <h6 className="mt-3 pl-12 text-xs font-medium text-muted-foreground" {...p}>
      {children}
    </h6>
  ),
  p: ({ node: _node, children, ...p }) => (
    <p className="text-sm leading-relaxed" {...p}>
      {children}
    </p>
  ),
  // 引用块（节点备注）：bg-card 上浮于内容区 muted 下陷底（原 bg-muted/60 在 muted
  // 底上隐身，M15 分节改版连带换肤）+ 青松左条（语义装饰非分区线）
  blockquote: ({ node: _node, children, ...p }) => (
    <blockquote
      className="mt-2 rounded-md border-l-2 border-primary/40 bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-xs"
      {...p}
    >
      {children}
    </blockquote>
  ),
  ul: ({ node: _node, children, ...p }) => (
    <ul className="mt-2 list-disc space-y-1 pl-6 text-sm" {...p}>
      {children}
    </ul>
  ),
  ol: ({ node: _node, children, ...p }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm" {...p}>
      {children}
    </ol>
  ),
  li: ({ node: _node, children, ...p }) => (
    <li className="leading-relaxed" {...p}>
      {children}
    </li>
  ),
  a: ({ node: _node, children, ...p }) => (
    <a className="text-primary underline underline-offset-2" {...p}>
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border/60" />,
  // code 分流（M17 备注即宿主）：围栏 ```mermaid → MermaidBlock 渲染小图（懒加载）；
  // 行内与其他语言 code 维持等宽小字（className 语言标记形如 language-mermaid）。
  // children 为 ReactNode 数组（文本片段），显式拼接非 String()（防 [object Object]）
  code: ({ node: _node, className, children, ...p }) => {
    const raw = (Array.isArray(children) ? children : [children])
      .map((c) => (typeof c === 'string' ? c : ''))
      .join('')
    if (/language-mermaid/.test(className ?? '')) return <MermaidBlock code={raw.replace(/\n$/, '')} />
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-file text-xs" {...p}>
        {children}
      </code>
    )
  },
  pre: ({ node: _node, children, ...p }) => (
    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-file text-xs leading-6" {...p}>
      {children}
    </pre>
  ),
  table: ({ node: _node, children, ...p }) => (
    <table className="mt-2 w-full text-sm" {...p}>
      {children}
    </table>
  ),
  th: ({ node: _node, children, ...p }) => (
    <th className="border-b border-border/60 px-2 py-1 text-left font-medium" {...p}>
      {children}
    </th>
  ),
  td: ({ node: _node, children, ...p }) => (
    <td className="border-b border-border/40 px-2 py-1" {...p}>
      {children}
    </td>
  ),
}

/** 插图渲染器工厂（M19）：src 命中 imgMap 换 dataURL（相对路径在 webview 下 404）；
 *  未命中（外链 http 等）原样；限幅圆角。工厂形态避免组件内定义组件（Sonar S6478） */
const imgRenderer =
  (imgMap?: ReadonlyMap<string, string>) =>
  ({ src, alt, ...p }: ComponentProps<'img'>): ReactElement => {
    const resolved = typeof src === 'string' && imgMap?.has(src) ? imgMap.get(src) : src
    return <img src={resolved} alt={alt ?? ''} className="my-2 max-w-full rounded-md" {...p} />
  }

interface Props {
  /** 导图 md 原文（渲染前逐行过 stripMarkers——[[..]] 连线标记与画布显示层同口径隐藏） */
  text: string
  /** 插图相对路径 → dataURL（M19：webview 解析不了工作区相对路径，FileDetail 构建传入；
   *  未命中的 src（外链 http 等）原样渲染） */
  imgMap?: ReadonlyMap<string, string>
}

/** markdown 预览（M15 文件详情态下层）：react-markdown + remark-gfm 渲染真实 md，
 *  样式与层级视觉见模块级 MD_COMPONENTS 注释。img 经 imgMap 解析工作区相对路径（M19）。
 *  标题锚点（2026-09 大纲联动）：渲染后按文档序注入 zen-h-N，与 mdOutline 同解析器
 *  （remark）同序号对齐；不在渲染期计数（React 并发下渲染重放不可靠） */
export default function MarkdownPreview({ text, imgMap }: Readonly<Props>) {
  // 连线/图标/标签标记按行剥离（标记永不跨行，与画布显示层同口径——md 原文仍是唯一事实源；
  //  标签在图标内侧，须先剥 icon 再剥 tag）
  const display = text
    .split('\n')
    .map((l) => stripTagMarkers(stripIconMarkers(stripMarkers(l))))
    .join('\n')
  const components = useMemo(() => ({ ...MD_COMPONENTS, img: imgRenderer(imgMap) }), [imgMap])
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let i = 0
    for (const el of rootRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [])
      el.id = `zen-h-${i++}`
  }, [display])
  return (
    // p-6：顶距 2026-09 补齐——首个标题（h1 无 mt）原零距贴住页首工具栏，顶距改与
    // 正文左右距一致（24px）；pb-2 只留滚动尾部呼吸位（卡脚已承接尾距，原 pb-6 偏空）
    <div ref={rootRef} data-testid="md-preview" className="min-h-0 flex-1 overflow-y-auto p-6 pb-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {display}
      </ReactMarkdown>
    </div>
  )
}
