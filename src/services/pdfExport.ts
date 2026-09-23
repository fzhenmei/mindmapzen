// src/services/pdfExport.ts —— 渲染 DOM → 完整打印 HTML 文档(2026-09-23 导出 Word/PDF
// spec §4.1):交给 Rust export_pdf_via_edge 无头打印成 PDF。样式与公众号主题同值
//(wechatCopy TAG_STYLE 直出 CSS,零二次维护),叠加打印规则:@page A4/2cm、标题
// 不孤立页尾、引用/代码/表格/图尽量不跨页拆断;pre 覆写 pre-wrap——公众号版
// white-space:pre 是给其代码组件横向滚动的,PDF 无滚动,长行必须折行
import { ROOT_STYLE, TAG_STYLE } from './wechatCopy'

/** title 转义(mapName 是用户内容,防逃逸文档结构) */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function buildPrintHtml(body: HTMLElement, title: string): string {
  const tagCss = Object.entries(TAG_STYLE)
    .map(([tag, css]) => `${tag.toLowerCase()}{${css}}`)
    .join('\n')
  return [
    '<!DOCTYPE html>',
    '<html lang="zh">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    '@page{size:A4;margin:2cm}',
    'html,body{margin:0;padding:0}',
    `body{${ROOT_STYLE}}`,
    tagCss,
    'pre{white-space:pre-wrap}',
    'blockquote,pre,table,img{break-inside:avoid}',
    'h1,h2,h3,h4,h5,h6{break-after:avoid}',
    '</style>',
    '</head>',
    '<body>',
    body.innerHTML,
    '</body>',
    '</html>',
  ].join('\n')
}
