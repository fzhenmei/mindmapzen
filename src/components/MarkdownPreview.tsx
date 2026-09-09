// src/components/MarkdownPreview.tsx —— 案头详情 md 预览(2026-09 渲染统一):
// react-markdown 退役,改 VDitor.preview(lute)——与正文弹窗预览、画布悬停窗三处一条
// 渲染管线。props 签名不变(FileDetail 零改动)。标记剥离(display)与标题锚点、imgMap
// 解析三件事保留:后两者改渲染后 DOM 后处理(applyImageMap/injectHeadingAnchors)。
// 主题跟随 appStore.resolvedTheme(zen-night → vditor dark mode)。
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { mdOutline } from '../services/mdOutline'
import { toDisplayText } from '../services/displayText'
import { applyImageMap, injectHeadingAnchors, renderVditorPreview } from '../services/vditorPreview'

const EMPTY_MAP: ReadonlyMap<string, string> = new Map()

interface Props {
  /** 导图 md 原文(渲染前逐行过 stripMarkers——[[..]] 连线标记与画布显示层同口径隐藏) */
  text: string
  /** 插图相对路径 → dataURL(M19:webview 解析不了工作区相对路径,FileDetail 构建传入) */
  imgMap?: ReadonlyMap<string, string>
}

/** markdown 预览(lute 管线):渲染异步,完成后做 imgMap 与锚点两件后处理;
 *  cancelled 守卫防 display/imgMap/theme 变更后的旧结果覆盖新渲染。渲染失败
 *  console.error 显式出口(禁止吞异常)——预览区留空但链路可追溯 */
export default function MarkdownPreview({ text, imgMap }: Readonly<Props>) {
  const theme = useAppStore((s) => s.resolvedTheme)
  // 连线/图标/标签标记按行剥离(displayText 共享口径,与发布复制同链)
  const display = toDisplayText(text)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    let cancelled = false
    renderVditorPreview(root, display, theme)
      .then(() => {
        if (cancelled) return
        applyImageMap(root, imgMap ?? EMPTY_MAP)
        injectHeadingAnchors(root, mdOutline(display))
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
