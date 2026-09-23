// src/services/publishBody.ts —— 发布级渲染中段(2026-09-23 导出 Word/PDF spec §2.1):
// md 文本 → 预处理(防炸包装解包 mdBodyUnwrapForDisplay + 显示层标记剥净 + mermaid 改标)
// → 离屏渲染 → 插图换 dataURL → mermaid 成图 → 剥 vditor 残留 → 代码高亮。
// 三格式共用:公众号复制(剪贴板)/导出 Word(docx)/导出 PDF(打印 HTML)在此汇合,
// finisher 各自落地。自 wechatCopy.ts 抽出(行为零变,存量 wechatCopy.test 即护栏);
// 舞台类名保留 wechat-copy-stage(该测试断言即用即清)
import type { FsAdapter } from '../types/files'
import { toDisplayText } from './displayText'
import { applyImgSrcMap, buildImageMetaFromSrcs, collectMdImageSrcs } from './imageAssets'
import { highlightCodeBlocks } from './codeHighlight'
import { replaceMermaidCode } from './mermaidImage'
import { renderVditorPreview } from './vditorPreview'
import { mdBodyUnwrapForDisplay } from './mdTree'

/** 插图换 dataURL:md 全文收集图片 src → buildImageMetaFromSrcs → 逐 img 命中替换
 *  (原文/百分号解码形态双比对在 applyImgSrcMap)。单图失败内部宽容跳过 */
async function resolveImages(fs: FsAdapter, wsDir: string, display: string, root: ParentNode): Promise<void> {
  const srcs = collectMdImageSrcs(display)
  if (srcs.size === 0) return
  const meta = await buildImageMetaFromSrcs(fs, wsDir, srcs)
  applyImgSrcMap(root, new Map([...meta].map(([k, v]) => [k, v.dataUrl])))
}

/** mermaid 代码块改标(```mermaid → ```zen-mermaid):vditor 无此语言适配器,预渲染
 *  改标防其异步成图竞态;渲染后由 mermaidImage.replaceMermaidCode 以自有配置成图换
 *  PNG dataURL img——公众号剥 SVG 唯图片可存活,单块失败保留代码块降级。
 *  逐行围栏状态机:跟踪开围栏字符与长度,闭合围栏(同字符、够长、无 info)才出块,
 *  代码块内部的 "```mermaid" 内容行不误伤 */
/** 单行围栏探测:行首允许空格与引用块 > 标记交错(防炸包装层、列表嵌套围栏深缩进
 *  ——前缀原样保留,只改写围栏 info);其后 3+ 连续 ` 或 ~ 记为围栏;返回前缀、
 *  围栏字符、长度与其后 info 串(手工计数不走正则,避开 S8786 回溯告警) */
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

/** 渲染容器 → 脱离的发布正文体:取 .vditor-reset 内容(无则容器自身兜底)克隆,
 *  剥全部 id 与 vditor 预览残留——复制按钮壳(textarea/svg)、末尾零宽测量 span;
 *  pre>code 上 vditor 的内联残留一并清空,代码块样式由 finisher 承担。返回克隆体
 *  (已脱离文档)——后续高亮等处理作用于其上,舞台上的 vditor 异步任务无法染指 */
export function extractPublishBody(rendered: HTMLElement): HTMLElement {
  const body = (rendered.querySelector('.vditor-reset') ?? rendered).cloneNode(true) as HTMLElement
  for (const el of body.querySelectorAll('[id]')) el.removeAttribute('id')
  for (const el of body.querySelectorAll('.vditor-copy, span[style*="position: absolute"]')) el.remove()
  for (const el of body.querySelectorAll<HTMLElement>('pre > code')) el.style.cssText = ''
  return body
}

/** 编排:md 文本 → 预处理 → 离屏渲染 → 插图换 dataURL → mermaid 成图 → 剥残留 +
 *  代码高亮 → 返回脱离文档的渲染体。失败原样上抛由调用方兜底;离屏舞台 attached 但
 *  移出视口(vditor 内部 IntersectionObserver 依赖挂载),finally 即清 */
export async function renderPublishBody(
  fs: FsAdapter,
  wsDir: string | null,
  mdText: string,
): Promise<HTMLElement> {
  // 显示形态剥正文包装层(防炸配套):贴来的标题按标题渲染,不是引用
  const display = stripMermaid(toDisplayText(mdBodyUnwrapForDisplay(mdText)))
  const stage = document.createElement('div')
  stage.className = 'wechat-copy-stage'
  stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;'
  document.body.append(stage)
  try {
    await renderVditorPreview(stage, display, 'light')
    if (wsDir !== null) await resolveImages(fs, wsDir, display, stage)
    await replaceMermaidCode(stage)
    // 先克隆脱离再高亮:舞台上的 vditor 异步 hljs 会重刷已知语言代码块并抹掉内联色
    const body = extractPublishBody(stage)
    await highlightCodeBlocks(body)
    return body
  } finally {
    stage.remove()
  }
}
