// src/services/wechatCopy.ts —— 案头"复制为公众号格式":md → 内联样式 HTML → 剪贴板。
// 公众号编辑器白名单清洗:<style>/class 全丢,只认元素内联 style(2026-09-09 设计),
// 故格式化层为自研逐元素内联样式映射,lute 仅负责 md→DOM 前半程
import type { FsAdapter } from '../types/files'
import { toDisplayText } from './displayText'
import { applyImgSrcMap, buildImageMetaFromSrcs, collectMdImageSrcs } from './imageAssets'
import { highlightCodeBlocks } from './codeHighlight'
import { replaceMermaidCode } from './mermaidImage'
import { renderVditorPreview } from './vditorPreview'
import { mdBodyUnwrapForDisplay } from './mdTree'

/** 插图换 dataURL:md 全文收集图片 src(2026-09 升级 collectMdImageSrcs——行尾标记
 *  口径的超集,正文引用块行中图同收)→ buildImageMetaFromSrcs → 逐 img 命中替换
 *  (原文/百分号解码形态双比对在 applyImgSrcMap) */
async function resolveImages(fs: FsAdapter, wsDir: string, display: string, root: ParentNode): Promise<void> {
  const srcs = collectMdImageSrcs(display)
  if (srcs.size === 0) return
  const meta = await buildImageMetaFromSrcs(fs, wsDir, srcs) // 单图失败内部宽容跳过
  applyImgSrcMap(root, new Map([...meta].map(([k, v]) => [k, v.dataUrl])))
}

/** 编排:读盘 → 预处理(显示层标记剥净 + mermaid 改标)→ 离屏渲染 → 插图换
 *  dataURL → mermaid 成图 → 代码高亮 → 剥 vditor 残留 + 内联样式 → 剪贴板。
 *  失败原样上抛,由调用方 setError 兜底;离屏舞台 attached 但移出视口(vditor
 *  内部 IntersectionObserver 依赖挂载),finally 即清 */
export async function copyAsWechatHtml(
  fs: FsAdapter,
  wsDir: string | null,
  mdPath: string,
  writeHtml: (html: string) => Promise<void>,
): Promise<void> {
  // 显示形态剥正文包装层(2026-09-22 防炸配套):贴来的标题按标题渲染,不是引用
  const display = stripMermaid(toDisplayText(mdBodyUnwrapForDisplay(await fs.readTextFile(mdPath))))
  const stage = document.createElement('div')
  stage.className = 'wechat-copy-stage'
  stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;'
  document.body.append(stage)
  try {
    await renderVditorPreview(stage, display, 'light')
    if (wsDir !== null) await resolveImages(fs, wsDir, display, stage)
    await replaceMermaidCode(stage)
    // 先克隆脱离再高亮:舞台上的 vditor 异步 hljs 会重刷已知语言代码块并
    // 抹掉内联色,克隆体它碰不到
    const body = extractPublishBody(stage)
    await highlightCodeBlocks(body)
    await writeHtml(wrapPublishHtml(body))
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
// 行高一律绝对 px(倍数×各级字号换算,视觉与无单位倍数等价):公众号后台内容
// 结构检测把 line-height 当 px 字面值与 font-size 比较,无单位 1.75/1.4/1.6 会
// 被判"行高小于字体大小、文字重叠"误报(2026-09-20 真机),px 值恒 ≥ 字号即不触发
const ROOT_STYLE = `font-family:${FONT_BODY};font-size:15px;color:#3f3f3f;line-height:26.25px;word-break:break-word` // 15×1.75

const HEADING_COLOR = 'color:#1f1f1f'
/** 微信链接色:保留的互链与剥成文字的外链共用(视觉与原文一致,只是后者不可点) */
const A_STYLE = 'color:#576b95;text-decoration:none'
const TAG_STYLE: Record<string, string> = {
  H1: `margin:28px 0 14px;font-size:20px;font-weight:600;line-height:28px;${HEADING_COLOR}`,
  H2: `margin:24px 0 12px;font-size:18px;font-weight:600;line-height:25.2px;${HEADING_COLOR}`,
  H3: `margin:20px 0 10px;font-size:16px;font-weight:600;line-height:22.4px;${HEADING_COLOR}`,
  H4: `margin:18px 0 8px;font-size:15px;font-weight:600;line-height:21px;${HEADING_COLOR}`,
  H5: `margin:18px 0 8px;font-size:15px;font-weight:600;line-height:21px;${HEADING_COLOR}`,
  H6: `margin:18px 0 8px;font-size:15px;font-weight:600;line-height:21px;${HEADING_COLOR}`,
  P: 'margin:12px 0',
  STRONG: 'font-weight:600;color:#1f1f1f',
  EM: 'font-style:italic',
  A: A_STYLE,
  BLOCKQUOTE: 'margin:16px 0;padding:10px 14px;border-left:3px solid #d0d0d0;background-color:#f7f7f7;color:#5f5f5f',
  CODE: `background-color:#f5f5f5;padding:2px 5px;border-radius:4px;font-size:14px;font-family:${FONT_MONO}`,
  // white-space:pre(不折行,超宽由公众号代码组件横向滚动,doocs 同款);text-align:left
  // 显式压两端对齐——微信粘贴会继承 justify,代码行内空格被拉伸(真机实测)
  PRE: `margin:16px 0;padding:14px;border-radius:6px;background-color:#f6f8fa;white-space:pre;text-align:left;font-size:13px;line-height:20.8px;font-family:${FONT_MONO}`,
  UL: 'margin:12px 0;padding-left:1.6em',
  OL: 'margin:12px 0;padding-left:1.6em',
  LI: 'margin:6px 0',
  TABLE: 'border-collapse:collapse;margin:16px 0;max-width:100%',
  TH: 'border:1px solid #e0e0e0;padding:8px 12px;background-color:#f7f7f7;font-weight:600',
  TD: 'border:1px solid #e0e0e0;padding:8px 12px',
  IMG: 'max-width:100%;display:block;margin:16px auto',
  HR: 'border:none;border-top:1px solid #e5e5e5;margin:24px 0',
}

/** 产物超链接白名单清洗:公众号保存校验只放行 mp.weixin.qq.com 域名互链,其余
 *  `<a>` 一律剥成带链接色的纯文字 span(2026-09-12 真机:外链保存被拒"请勿插入
 *  非 mp.weixin.qq.com 域名的链接")。覆盖全部来源:md 显式链接、lute GFM
 *  autolink 的裸网址、相对路径与锚点(无域名不豁免);URL 解析失败的也剥。
 *  在 applyWechatStyles 之前跑:保留的互链照常走 TAG_STYLE.A,剥出的 span
 *  不在选择器内、样式此刻写死 */
export function stripExternalLinks(root: ParentNode): void {
  for (const a of Array.from(root.querySelectorAll('a'))) {
    if (isWechatArticleLink(a.getAttribute('href') ?? '')) continue
    const span = document.createElement('span')
    span.style.cssText = A_STYLE
    span.append(...Array.from(a.childNodes))
    a.replaceWith(span)
  }
}

/** href → 是否公众号文章互链:绝对 URL 且 hostname 精确等于 mp.weixin.qq.com
 *  (URL 小写化 hostname,协议 http/https 等价;无 base,相对/锚点直接抛错判否) */
function isWechatArticleLink(href: string): boolean {
  try {
    return new URL(href).hostname === 'mp.weixin.qq.com'
  } catch {
    return false
  }
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

/** 渲染容器 → 脱离的发布正文体:取 .vditor-reset 内容(无则容器自身兜底)克隆,
 *  剥全部 id(锚点/编辑器内部标识,发布无用)与 vditor 预览残留——复制按钮壳
 *  (textarea/svg,公众号剥控件后留大空腔)、末尾零宽测量 span;pre>code 上
 *  vditor 的内联残留(max-height 等)一并清空,代码块样式全部由 pre 承担。
 *  返回克隆体(已脱离文档)——后续高亮等处理作用于其上,舞台上的 vditor 异步
 *  任务(hljs 重刷)无法染指 */
export function extractPublishBody(rendered: HTMLElement): HTMLElement {
  const body = (rendered.querySelector('.vditor-reset') ?? rendered).cloneNode(true) as HTMLElement
  for (const el of body.querySelectorAll('[id]')) el.removeAttribute('id')
  for (const el of body.querySelectorAll('.vditor-copy, span[style*="position: absolute"]')) el.remove()
  for (const el of body.querySelectorAll<HTMLElement>('pre > code')) el.style.cssText = ''
  return body
}

/** 发布正文体 → 可粘贴 HTML 串:外链剥文字 + 刷内联样式,包一层 section 承担
 *  基础排版(公众号粘贴惯例:单 section 根) */
export function wrapPublishHtml(body: HTMLElement): string {
  stripExternalLinks(body)
  applyWechatStyles(body)
  const section = document.createElement('section')
  section.style.cssText = ROOT_STYLE
  section.append(...Array.from(body.childNodes))
  return section.outerHTML
}

/** 渲染容器 → 可粘贴 HTML 串(extract + wrap 直连,无中间处理场景/测试用) */
export function buildWechatHtml(rendered: HTMLElement): string {
  return wrapPublishHtml(extractPublishBody(rendered))
}
