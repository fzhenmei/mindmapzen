// src/services/wechatCopy.ts —— 案头"复制为公众号格式":md → 内联样式 HTML → 剪贴板。
// 公众号编辑器白名单清洗:<style>/class 全丢,只认元素内联 style(2026-09-09 设计),
// 故格式化层为自研逐元素内联样式映射,lute 仅负责 md→DOM 前半程
import type { FsAdapter } from '../types/files'
import { toDisplayText } from './displayText'
import { buildImageMetaFromSrcs } from './imageAssets'
import { extractImageMarker } from './imageMarkers'
import { replaceMermaidCode } from './mermaidImage'
import { renderVditorPreview } from './vditorPreview'

/** src 解码形态(vditor 预览会把非 ASCII src 百分号编码,如 assets/配图.png →
 *  assets/%E9…png);已损坏的编码序列无解码形态,原样返回(等于未命中) */
const decodedSrc = (src: string): string => {
  try {
    return decodeURIComponent(src)
  } catch {
    return src
  }
}

/** 插图换 dataURL:与案头详情同口径(行级收集图片标记 → buildImageMetaFromSrcs),
 *  逐 img 按 src 原文或解码形态比对命中 */
async function resolveImages(fs: FsAdapter, wsDir: string, display: string, root: ParentNode): Promise<void> {
  const srcs = new Set(
    display.split('\n').map((l) => extractImageMarker(l)?.src).filter((s): s is string => s !== undefined),
  )
  if (srcs.size === 0) return
  const meta = await buildImageMetaFromSrcs(fs, wsDir, srcs) // 单图失败内部宽容跳过
  for (const img of root.querySelectorAll('img')) {
    const raw = img.getAttribute('src')
    if (raw === null || raw === '') continue
    const hit = meta.get(raw) ?? meta.get(decodedSrc(raw))
    if (hit !== undefined) img.src = hit.dataUrl
  }
}

/** 编排:读盘 → 预处理(显示层标记剥净 + mermaid 降级)→ 离屏渲染 → 插图换
 *  dataURL → 内联样式 → 剪贴板。失败原样上抛,由调用方 setError 兜底;离屏舞台
 *  attached 但移出视口(vditor 内部 IntersectionObserver 依赖挂载),finally 即清 */
export async function copyAsWechatHtml(
  fs: FsAdapter,
  wsDir: string | null,
  mdPath: string,
  writeHtml: (html: string) => Promise<void>,
): Promise<void> {
  const display = stripMermaid(toDisplayText(await fs.readTextFile(mdPath)))
  const stage = document.createElement('div')
  stage.className = 'wechat-copy-stage'
  stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;'
  document.body.append(stage)
  try {
    await renderVditorPreview(stage, display, 'light')
    if (wsDir !== null) await resolveImages(fs, wsDir, display, stage)
    await replaceMermaidCode(stage)
    await writeHtml(buildWechatHtml(stage))
  } finally {
    stage.remove()
  }
}

/** mermaid 代码块改标(```mermaid → ```zen-mermaid):vditor 无此语言适配器,预渲染
 *  改标防其异步成图竞态;渲染后由 mermaidImage.replaceMermaidCode 以自有配置
 *  (htmlLabels:false 无 foreignObject)成图换 PNG dataURL img——公众号剥 SVG,
 *  唯图片可存活,单块失败保留代码块降级。
 *  逐行围栏状态机:跟踪开围栏字符与长度,闭合围栏(同字符、够长、无 info)才出块,
 *  代码块内部的 "```mermaid" 内容行不误伤 */
/** 单行围栏探测:行首允许空格与引用块 > 标记交错(正文块即引用块、列表嵌套围栏
 *  深缩进——前缀原样保留,只改写围栏 info),其后 3+ 连续 ` 或 ~ 记为围栏;
 *  返回前缀、围栏字符、长度与其后 info 串(手工计数不走正则,避开 S8786 回溯告警) */
function fenceRun(line: string): { prefix: string; ch: string; len: number; rest: string } | null {
  let i = 0
  let advanced = true
  while (advanced) {
    advanced = false
    while (i < line.length && line[i] === ' ') {
      i++
      advanced = true
    }
    if (i < line.length && line[i] === '>') {
      i++
      advanced = true
    }
  }
  const ch = line[i]
  if (ch !== '`' && ch !== '~') return null
  let len = 0
  while (i + len < line.length && line[i + len] === ch) len++
  if (len < 3) return null
  return { prefix: line.slice(0, i), ch, len, rest: line.slice(i + len) }
}

export function stripMermaid(md: string): string {
  const lines = md.split('\n')
  let open: { ch: string; len: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const f = fenceRun(lines[i]!)
    if (open === null) {
      if (f === null) continue
      const info = f.rest.trim()
      if (info === 'mermaid' || info.startsWith('mermaid ')) {
        lines[i] = `${f.prefix}${f.ch.repeat(f.len)}zen-mermaid`
      }
      open = { ch: f.ch, len: f.len }
    } else if (f !== null && f.ch === open.ch && f.len >= open.len && f.rest.trim() === '') {
      open = null
    }
  }
  return lines.join('\n')
}

/** 单一内置主题(简洁整齐,2026-09-09 设计裁决):正文 15px/1.75 深灰,标题纯
 *  字号+字重分层,引用左竖线浅灰底,代码浅灰底 GitHub 风,列表 padding 缩进。
 *  公众号白名单只认元素内联 style,故逐标签写死 CSS 串(不做主题系统) */
const FONT_BODY = `-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif`
const FONT_MONO = `'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace`
const ROOT_STYLE = `font-family:${FONT_BODY};font-size:15px;color:#3f3f3f;line-height:1.75;word-break:break-word`

const HEADING_COLOR = 'color:#1f1f1f;line-height:1.4'
const TAG_STYLE: Record<string, string> = {
  H1: `margin:28px 0 14px;font-size:20px;font-weight:600;${HEADING_COLOR}`,
  H2: `margin:24px 0 12px;font-size:18px;font-weight:600;${HEADING_COLOR}`,
  H3: `margin:20px 0 10px;font-size:16px;font-weight:600;${HEADING_COLOR}`,
  H4: `margin:18px 0 8px;font-size:15px;font-weight:600;${HEADING_COLOR}`,
  H5: `margin:18px 0 8px;font-size:15px;font-weight:600;${HEADING_COLOR}`,
  H6: `margin:18px 0 8px;font-size:15px;font-weight:600;${HEADING_COLOR}`,
  P: 'margin:12px 0',
  STRONG: 'font-weight:600;color:#1f1f1f',
  EM: 'font-style:italic',
  A: 'color:#576b95;text-decoration:none',
  BLOCKQUOTE: 'margin:16px 0;padding:10px 14px;border-left:3px solid #d0d0d0;background-color:#f7f7f7;color:#5f5f5f',
  CODE: `background-color:#f5f5f5;padding:2px 5px;border-radius:4px;font-size:14px;font-family:${FONT_MONO}`,
  PRE: `margin:16px 0;padding:14px;border-radius:6px;background-color:#f6f8fa;white-space:pre-wrap;font-size:13px;line-height:1.6;font-family:${FONT_MONO}`,
  UL: 'margin:12px 0;padding-left:1.6em',
  OL: 'margin:12px 0;padding-left:1.6em',
  LI: 'margin:6px 0',
  TABLE: 'border-collapse:collapse;margin:16px 0;max-width:100%',
  TH: 'border:1px solid #e0e0e0;padding:8px 12px;background-color:#f7f7f7;font-weight:600',
  TD: 'border:1px solid #e0e0e0;padding:8px 12px',
  IMG: 'max-width:100%;display:block;margin:16px auto',
  HR: 'border:none;border-top:1px solid #e5e5e5;margin:24px 0',
}

/** 逐元素内联样式:遍历命中标签刷 style(cssText 覆写——渲染产物上的既有内联
 *  样式一律以主题为准)。pre>code 跳过:块级代码样式在 pre 上,内层不再叠底,
 *  字体字号由 pre 继承 */
export function applyWechatStyles(root: ParentNode): void {
  const selector = Object.keys(TAG_STYLE).join(',').toLowerCase()
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    if (el.tagName === 'CODE' && el.parentElement?.tagName === 'PRE') continue
    const css = TAG_STYLE[el.tagName]
    if (css !== undefined) el.style.cssText = css
  }
}

/** 渲染容器 → 可粘贴 HTML 串:取 .vditor-reset 内容(无则容器自身兜底)克隆,
 *  剥全部 id(锚点/编辑器内部标识,发布无用),刷内联样式,包一层 section 承担
 *  基础排版(公众号粘贴惯例:单 section 根) */
export function buildWechatHtml(rendered: HTMLElement): string {
  const body = (rendered.querySelector('.vditor-reset') ?? rendered).cloneNode(true) as HTMLElement
  for (const el of body.querySelectorAll('[id]')) el.removeAttribute('id')
  applyWechatStyles(body)
  const section = document.createElement('section')
  section.style.cssText = ROOT_STYLE
  section.append(...Array.from(body.childNodes))
  return section.outerHTML
}
