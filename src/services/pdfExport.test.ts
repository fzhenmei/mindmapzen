// src/services/pdfExport.test.ts —— 打印 HTML finisher 单测:完整文档结构、@page、
// 分页规则、样式与公众号同值(TAG_STYLE 直出 CSS)、pre 改 pre-wrap、title 转义
import { describe, expect, test } from 'vitest'
import { buildPrintHtml } from './pdfExport'

function bodyOf(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('buildPrintHtml:渲染 DOM → 打印 HTML 文档', () => {
  test('完整 HTML5 文档:声明/head/meta/title/body 内嵌渲染体', () => {
    const html = buildPrintHtml(bodyOf('<p>正文</p>'), '我的图')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>我的图</title>')
    expect(html).toContain('<p>正文</p>')
  })

  test('title 注入转义(用户内容不逃逸文档结构)', () => {
    const html = buildPrintHtml(bodyOf('<p>x</p>'), 'a<b>&"c')
    expect(html).toContain('<title>a&lt;b&gt;&amp;&quot;c</title>')
  })

  test('@page A4 2cm + 分页规则:标题不孤页尾、引用/代码/表格/图不拆断', () => {
    const html = buildPrintHtml(bodyOf('<p>x</p>'), 't')
    expect(html).toContain('@page{size:A4;margin:2cm}')
    expect(html).toContain('blockquote,pre,table,img{break-inside:avoid}')
    expect(html).toContain('h1,h2,h3,h4,h5,h6{break-after:avoid}')
  })

  test('样式与公众号同值:引用块左竖线+浅灰底直出 CSS(pre 覆写 pre-wrap 防长行截断)', () => {
    const html = buildPrintHtml(bodyOf('<p>x</p>'), 't')
    expect(html).toContain('border-left:3px solid #d0d0d0') // TAG_STYLE.BLOCKQUOTE 直出
    expect(html).toContain('background-color:#f7f7f7')
    expect(html).toMatch(/pre\{[^}]*white-space:pre-wrap/) // 覆写(公众号版 white-space:pre 是给代码组件滚动的)
  })

  test('pre 内层 code 覆写:透明底/零内边距(对齐公众号链跳过 PRE 内 CODE 的观感)', () => {
    const html = buildPrintHtml(bodyOf('<p>x</p>'), 't')
    // 行内 code 规则(padd 2px 5px/f5f5f5 底/14px)会命中 pre>code,须显式归零归继承
    expect(html).toContain('pre code{background-color:transparent;padding:0;border-radius:0;font-size:inherit;font-family:inherit}')
  })
})
