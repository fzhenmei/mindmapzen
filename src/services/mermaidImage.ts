// src/services/mermaidImage.ts —— mermaid 代码块 → PNG dataURL img(2026-09 发布复制)。
// 不走 vditor 自带 mermaidRender:其 htmlLabels:true 产出 foreignObject(canvas 光栅化
// 会空白)且异步时序不受控;此处自有配置成图(纯 SVG 文本标签 + 显式宽高)。
// 光栅化与脚本加载经 MermaidDeps 注入(生产默认真实现,jsdom 单测替换)
import { VDITOR_CDN } from './vditorPreview'

/** mermaid 脚本(与 vditor dist 同一份 vendor 文件;v=11.16.1 对齐 vditor 加载参数) */
const MERMAID_SRC = `${VDITOR_CDN}/dist/js/mermaid/mermaid.min.js`

interface MermaidLike {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}

/** 依赖注入口:load 加载 mermaid 全局,rasterize 把 SVG 串转 PNG dataURL */
export interface MermaidDeps {
  load(): Promise<MermaidLike>
  rasterize(svg: string, scale: number): Promise<string>
}

/** vendor mermaid 脚本加载(script 注入,会话级缓存;详情预览已由 vditor 加载过
 *  window.mermaid 时直接复用——两处各自 initialize,互不覆盖对方的后续渲染) */
let mermaidPromise: Promise<MermaidLike> | null = null

export function loadMermaid(): Promise<MermaidLike> {
  const w = window as unknown as { mermaid?: MermaidLike }
  if (w.mermaid !== undefined) return Promise.resolve(w.mermaid)
  if (mermaidPromise !== null) return mermaidPromise
  mermaidPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = MERMAID_SRC
    s.onload = () => {
      const m = (window as unknown as { mermaid?: MermaidLike }).mermaid
      if (m === undefined) {
        mermaidPromise = null
        reject(new Error('mermaid 脚本已载入但全局缺失'))
      } else {
        resolve(m)
      }
    }
    s.onerror = () => {
      mermaidPromise = null // 允许后续重试
      reject(new Error(`mermaid 脚本加载失败:${MERMAID_SRC}`))
    }
    document.head.append(s)
  })
  return mermaidPromise
}

/** SVG 串 → PNG dataURL:blob URL → Image.decode → canvas 按 scale 放大绘制
 *  (默认 2x,公众号压缩下保清晰)。svg 无显式宽高时 naturalWidth 为 0,显式抛错
 *  由调用方降级(配置 useMaxWidth:false 已从源头保证带宽高) */
export async function svgToPngDataUrl(svg: string, scale: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    if (img.naturalWidth === 0 || img.naturalHeight === 0) throw new Error('SVG 无显式宽高,无法光栅化')
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas 2d 上下文不可用')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 生产依赖:真脚本加载 + 真光栅化(2x) */
const defaultDeps: MermaidDeps = { load: loadMermaid, rasterize: (svg, scale) => svgToPngDataUrl(svg, scale) }

/** mermaid 成图配置:htmlLabels:false(纯 SVG 文本标签,无 foreignObject——canvas
 *  光栅化安全)、常用图类 useMaxWidth:false(svg 带显式 px 宽高,Image 有内在尺寸) */
const MERMAID_CONFIG: Record<string, unknown> = {
  securityLevel: 'loose',
  altFontFamily: 'sans-serif',
  fontFamily: 'sans-serif',
  startOnLoad: false,
  flowchart: { htmlLabels: false, useMaxWidth: false },
  sequence: { useMaxWidth: false },
  class: { useMaxWidth: false },
  state: { useMaxWidth: false },
  er: { useMaxWidth: false },
  gantt: { useMaxWidth: false },
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const MERMAID_FONT_SIZE = 16 // mermaid 默认主题字号(FO 高 24 = 16 × 行高 1.5 同源)

/** mermaid v11 节点标签恒用 foreignObject 呈 HTML(实测 htmlLabels:false 只管住
 *  边标签),而 Chromium 对含 foreignObject 的 SVG 光栅化必污染 canvas(SecurityError,
 *  与 URL 是否同源无关)。DOM 手术:按 FO 自带宽高把标签换算为居中 <text>(tspan
 *  承 <br> 多行),标签底框与父级 transform 不动——纯函数,jsdom 可测 */
export function foreignObjectToText(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const fos = Array.from(doc.querySelectorAll('foreignObject'))
  if (fos.length === 0) return svg
  for (const fo of fos) {
    const w = Number.parseFloat(fo.getAttribute('width') ?? '0')
    const h = Number.parseFloat(fo.getAttribute('height') ?? '0')
    const text = doc.createElementNS(SVG_NS, 'text')
    text.setAttribute('x', String(w / 2))
    text.setAttribute('y', String(h / 2))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')
    text.setAttribute('font-size', String(MERMAID_FONT_SIZE))
    const lines = foLabelLines(fo)
    const lineH = lines.length > 1 ? h / lines.length : h
    lines.forEach((ln, i) => {
      const tspan = doc.createElementNS(SVG_NS, 'tspan')
      tspan.setAttribute('x', String(w / 2))
      tspan.setAttribute('y', String(h / 2 + (i - (lines.length - 1) / 2) * lineH))
      tspan.textContent = ln
      text.append(tspan)
    })
    fo.replaceWith(text)
  }
  return new XMLSerializer().serializeToString(doc)
}

/** FO 内 HTML 取文本行:<br> 分段,其余节点文本按序拼接(嵌套 span 摊平) */
function foLabelLines(fo: Element): string[] {
  const out: string[] = ['']
  const walk = (node: Node): void => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'br') {
      out.push('')
      return
    }
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out[out.length - 1] += child.textContent ?? ''
      else walk(child)
    }
  }
  walk(fo)
  return out
}

/** 收集 code.language-zen-mermaid 块逐个成图:mermaid.render → PNG dataURL →
 *  img 替换整个 pre。单块失败保留该代码块继续其余(现状降级行为);脚本加载失败
 *  整体保留并 console.error 显式出口——发布复制不因图表失败而中断 */
export async function replaceMermaidCode(root: ParentNode, deps: MermaidDeps = defaultDeps): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('code.language-zen-mermaid'))
  if (blocks.length === 0) return // 快速路径:无 mermaid 块不加载脚本
  let mermaid: MermaidLike
  try {
    mermaid = await deps.load()
  } catch (e) {
    console.error('mermaid 脚本加载失败,图表降级为代码块', e)
    return
  }
  mermaid.initialize(MERMAID_CONFIG)
  for (const [i, code] of blocks.entries()) {
    try {
      const { svg } = await mermaid.render(`zen-mmd-${i}`, code.textContent ?? '')
      const img = document.createElement('img')
      img.src = await deps.rasterize(foreignObjectToText(svg), 2)
      code.parentElement?.replaceWith(img)
    } catch (e) {
      console.error(`mermaid 图成图失败,保留代码块(第 ${i + 1} 处)`, e)
    }
  }
}
