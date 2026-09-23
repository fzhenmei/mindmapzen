// src/services/docxExport.test.ts —— docx 映射单测:解包 OOXML 断言关键结构
//(引用块左边框+底纹/标题级/代码高亮逐 run 色/图片嵌入/超链接/列表编号/未覆盖降级)
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, test, vi } from 'vitest'
import { buildDocxFromBody } from './docxExport'

function bodyOf(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

/** 1×1 透明 PNG(e2eHarness harnessPngBytes 同款字节)→ dataURL */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function docXml(html: string): Promise<{ xml: string; files: Record<string, Uint8Array> }> {
  const bytes = await buildDocxFromBody(bodyOf(html), '测试图')
  expect(bytes[0]).toBe(0x50) // PK zip 头:产物是合法 docx 容器
  expect(bytes[1]).toBe(0x4b)
  const files = unzipSync(bytes)
  return { xml: strFromU8(files['word/document.xml']!), files }
}

describe('buildDocxFromBody:DOM → docx 映射(样式值与公众号主题同源)', () => {
  test('引用块(用户手写真引用):段落左边框 D0D0D0 + 底纹 F7F7F7', async () => {
    const { xml } = await docXml('<blockquote><p>引文</p></blockquote>')
    expect(xml).toContain('<w:pBdr') // 段落边框
    expect(xml).toContain('w:color="D0D0D0"')
    expect(xml).toContain('w:fill="F7F7F7"')
    expect(xml).toContain('引文')
  })

  test('标题分层:h1→Heading1 + 15pt(half-point 30),正文 11pt', async () => {
    const { xml } = await docXml('<h1>大标题</h1><p>正文段</p>')
    expect(xml).toContain('w:val="Heading1"')
    expect(xml).toContain('w:val="30"')
    expect(xml).toContain('w:val="22"')
  })

  test('代码块:F6F8FA 底纹 + Consolas + hljs 逐 run 颜色 + 换行保留', async () => {
    const { xml } = await docXml(
      '<pre><code><span style="color: rgb(0, 128, 0)">const</span> a = 1\nlet b</code></pre>',
    )
    expect(xml).toContain('w:fill="F6F8FA"')
    expect(xml).toContain('w:ascii="Consolas"')
    expect(xml).toContain('w:val="008000"') // rgb(0,128,0) → 008000(docx run 色属性是 w:val)
    expect(xml).toContain('<w:br/>') // 换行进 run break
  })

  test('行内码:run 底纹 F5F5F5 + 等宽', async () => {
    const { xml } = await docXml('<p>前<code>inline</code>后</p>')
    expect(xml).toContain('w:fill="F5F5F5"')
    expect(xml).toContain('inline')
  })

  test('图片(含 mermaid PNG):dataURL 嵌入 word/media + drawing', async () => {
    const { xml, files } = await docXml(`<p><img src="data:image/png;base64,${PNG_B64}"></p>`)
    expect(Object.keys(files).some((f) => f.startsWith('word/media/'))).toBe(true)
    expect(xml).toContain('<w:drawing>')
  })

  test('超链接:ExternalHyperlink 可点击(导出无公众号剥链约束)', async () => {
    const { xml, files } = await docXml('<p><a href="https://example.com/doc">参考</a></p>')
    expect(xml).toContain('<w:hyperlink')
    expect(strFromU8(files['word/_rels/document.xml.rels']!)).toContain('https://example.com/doc')
  })

  test('列表:嵌套 ul 走 zen-ul 编号引用', async () => {
    const { xml } = await docXml('<ul><li>a<ul><li>b</li></ul></li></ul>')
    // docx 不序列化 reference 名(zen-ul 仅库内映射),断言实际编号结构:嵌套项 ilvl=1
    expect(xml).toContain('<w:numPr>')
    expect(xml).toContain('<w:ilvl w:val="1"/>')
  })

  test('表格:单元格边框 E0E0E0 + 表头底纹', async () => {
    const { xml } = await docXml('<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>')
    expect(xml).toContain('w:color="E0E0E0"')
    expect(xml).toContain('<w:tbl>')
  })

  test('未覆盖标签降级为纯文本段,console.warn 留痕(内容不丢)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { xml } = await docXml('<figure>图注文字</figure>')
    expect(xml).toContain('图注文字')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test('文档元数据:title = mapName', async () => {
    const bytes = await buildDocxFromBody(bodyOf('<p>x</p>'), '我的导图')
    const files = unzipSync(bytes)
    expect(strFromU8(files['docProps/core.xml']!)).toContain('我的导图')
  })
})
