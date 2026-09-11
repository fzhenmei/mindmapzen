// src/components/MarkdownPreview.tsx —— 案头详情 md 预览(2026-09 渲染统一):
// react-markdown 退役,改 VDitor.preview(lute)——与正文弹窗预览、画布悬停窗三处一条
// 渲染管线。props 签名不变(FileDetail 零改动)。标记剥离(display)与标题锚点、imgMap
// 解析三件事保留:后两者改渲染后 DOM 后处理(applyImageMap/injectHeadingAnchors)。
// 主题跟随 appStore.resolvedTheme(zen-night → vditor dark mode)。
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { mdOutline } from '../services/mdOutline'
import { toDisplayText } from '../services/displayText'
import { highlightCodeBlocks } from '../services/codeHighlight'
import { applyImageMap, injectHeadingAnchors, renderVditorPreview } from '../services/vditorPreview'

const EMPTY_MAP: ReadonlyMap<string, string> = new Map()

interface Props {
  /** 导图 md 原文(渲染前逐行过 stripMarkers——[[..]] 连线标记与画布显示层同口径隐藏) */
  text: string
  /** 插图相对路径 → dataURL(M19:webview 解析不了工作区相对路径,FileDetail 构建传入) */
  imgMap?: ReadonlyMap<string, string>
}

/** markdown 预览(lute 管线):渲染异步且经内部队列串行化(同容器不并发渲染,
 *  竞态机制见组件内 I1 注释),完成后做 imgMap 与锚点两件后处理;cancelled 守卫
 *  防 display/imgMap/theme 变更后的旧结果覆盖新渲染。渲染失败 console.error
 *  显式出口(禁止吞异常)——预览区留空但链路可追溯 */
export default function MarkdownPreview({ text, imgMap }: Readonly<Props>) {
  const theme = useAppStore((s) => s.resolvedTheme)
  // 连线/图标/标签标记按行剥离(displayText 共享口径,与发布复制同链)
  const display = toDisplayText(text)
  const rootRef = useRef<HTMLDivElement>(null)
  // 渲染串行化 + 最新值胜出（终审 I1）：vditor addScript 在脚本加载窗内二次调用会再建
  // script、两回调完成序随机（node_modules/vditor/dist/index.js），同容器并发渲染时
  // 空文本方后完成即 innerHTML='' 清掉已填文本，且 effect deps 不变不自愈（消息永久
  // 空白；生产暴露：工具轮 finalize 挂 md 后第二轮 delta 密集重渲染）。两道防线：
  // - queueRef 持 promise 链，渲染严格排队——前一个完成前不发下一个请求，完成序天然有序
  // - latestRef 存最新 display/theme/imgMap，排队任务执行时取当前最新值——即便任务由
  //   旧 deps 触发，落到 DOM 的也是最新内容（后发覆盖先发）
  const latestRef = useRef({ display, theme, imgMap: imgMap ?? EMPTY_MAP })
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    latestRef.current = { display, theme, imgMap: imgMap ?? EMPTY_MAP }
    let cancelled = false
    queueRef.current = queueRef.current
      .then(async () => {
        if (cancelled) return
        const { display: md, theme: th, imgMap: im } = latestRef.current
        await renderVditorPreview(root, md, th)
        if (cancelled) return
        applyImageMap(root, im)
        injectHeadingAnchors(root, mdOutline(md))
        // 自管语法高亮(vditor 内置已关,自毒化循环见 vditorPreview 注释):预览形态
        // 只出 token span,着色交 vditor CSS,深浅主题通吃
        await highlightCodeBlocks(root, undefined, { inlineColors: false })
      })
      .catch((e: unknown) => console.error('案头 md 预览渲染失败', e))
    return () => {
      cancelled = true
    }
  }, [display, imgMap, theme])
  // md-preview 类名是 App.css 融合样式钩子（.md-preview .vditor-reset 案头预览字号/行高,
  //  同 zen-bar/caption-name 的类名钩子先例）;data-testid 供测试/e2e 定位
  return <div ref={rootRef} data-testid="md-preview" className="md-preview min-h-0 flex-1 overflow-y-auto p-6 pb-2" />
}
