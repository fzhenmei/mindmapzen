// src/services/wechatCopy.ts —— "复制为公众号格式":md → 内联样式 HTML → 剪贴板。
// 两入口同一链:案头文件右键(copyAsWechatHtml 读盘)/画布 Markdown 视图钮
// (copyWechatHtmlFromMd 直喂内存序列化文本)。
// 公众号编辑器白名单清洗:<style>/class 全丢,只认元素内联 style(2026-09-09 设计),
// 故格式化层为自研逐元素内联样式映射,lute 仅负责 md→DOM 前半程
import type { FsAdapter } from '../types/files'
import { extractPublishBody, renderPublishBody } from './publishBody'

export { stripMermaid } from './publishBody'

/** 编排:读盘 → 委托 copyWechatHtmlFromMd(案头文件右键入口)。
 *  失败原样上抛,由调用方 setError 兜底 */
export async function copyAsWechatHtml(
  fs: FsAdapter,
  wsDir: string | null,
  mdPath: string,
  writeHtml: (html: string) => Promise<void>,
): Promise<void> {
  await copyWechatHtmlFromMd(fs, wsDir, await fs.readTextFile(mdPath), writeHtml)
}

/** 编排:md 文本 → 共享渲染中段(renderPublishBody)→ 公众号 finisher(剥外链 +
 *  刷内联样式)→ 剪贴板。直喂文本入口(2026-09 画布 Markdown 视图「复制为公众号
 *  格式」:数据源 = 内存树序列化,含未保存修改——所见即所复制)。失败原样上抛,
 *  由调用方兜底 */
export async function copyWechatHtmlFromMd(
  fs: FsAdapter,
  wsDir: string | null,
  mdText: string,
  writeHtml: (html: string) => Promise<void>,
): Promise<void> {
  const body = await renderPublishBody(fs, wsDir, mdText)
  await writeHtml(wrapPublishHtml(body))
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
