// src/services/wechatCopy.test.ts —— 案头"复制为公众号格式"单测:预处理、内联样式
// 映射、编排链(渲染走 mock 注入代表性 DOM,jsdom 不跑 vditor)
import { describe, expect, test, vi } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { applyWechatStyles, buildWechatHtml, copyAsWechatHtml, stripMermaid } from './wechatCopy'

describe('stripMermaid:mermaid 围栏改 zen-mermaid 标记(vditor 无此适配器不触其成图,成图由 mermaidImage 管线接管)', () => {
  test('```mermaid 围栏改标 ```zen-mermaid,其余围栏不动', () => {
    const md = ['# 标题', '', '```mermaid', 'graph TD', '```', '', '```js', 'const a = 1', '```'].join('\n')
    expect(stripMermaid(md)).toBe(
      ['# 标题', '', '```zen-mermaid', 'graph TD', '```', '', '```js', 'const a = 1', '```'].join('\n'),
    )
  })

  test('~~~mermaid 围栏同样改标(围栏字符保持原样)', () => {
    const md = ['~~~mermaid', 'graph TD', '~~~'].join('\n')
    expect(stripMermaid(md)).toBe(['~~~zen-mermaid', 'graph TD', '~~~'].join('\n'))
  })

  test('围栏后带空格与 info 附加串(如 mermaid x)也改标', () => {
    const md = ['```mermaid ', 'A-->B', '```'].join('\n')
    expect(stripMermaid(md)).toBe(['```zen-mermaid', 'A-->B', '```'].join('\n'))
  })

  test('正文中的 mermaid 单词不误伤(非围栏行)', () => {
    expect(stripMermaid('提到 mermaid 工具')).toBe('提到 mermaid 工具')
  })

  test('正文块(引用块)内的围栏带 > 前缀,同样改标(正文即引用块,mermaid 多居于此)', () => {
    const md = ['> ```mermaid', '> graph TD', '> ```'].join('\n')
    expect(stripMermaid(md)).toBe(['> ```zen-mermaid', '> graph TD', '> ```'].join('\n'))
  })

  test('列表深嵌套缩进围栏(>3 空格)同样改标,前缀与缩进保留', () => {
    const md = ['      ```mermaid', '      graph TD', '      ```'].join('\n')
    expect(stripMermaid(md)).toBe(['      ```zen-mermaid', '      graph TD', '      ```'].join('\n'))
  })

  test('开围栏内的 "```mermaid" 内容行不误伤(围栏状态机防伪开)', () => {
    const md = ['```js', 'const s = "```mermaid"', '```'].join('\n')
    expect(stripMermaid(md)).toBe(md)
  })
})

/** 构造代表性 DOM 片段并应用内联样式(applyWechatStyles 直接吃真 DOM) */
const styled = (html: string): ParentNode => {
  const root = document.createElement('div')
  root.innerHTML = html
  applyWechatStyles(root)
  return root
}

describe('applyWechatStyles:逐元素内联样式(公众号只认元素 style)', () => {
  test('标题分层:纯字号+字重(h1 20 / h2 18 / h3 16),深色统一', () => {
    const root = styled('<h1>一</h1><h2>二</h2><h3>三</h3>')
    const [h1, h2, h3] = [...root.querySelectorAll<HTMLElement>('h1,h2,h3')]
    expect(h1!.style.fontSize).toBe('20px')
    expect(h2!.style.fontSize).toBe('18px')
    expect(h3!.style.fontSize).toBe('16px')
    for (const h of [h1, h2, h3]) {
      expect(h!.style.fontWeight).toBe('600')
      expect(h!.style.color).toBe('rgb(31, 31, 31)')
    }
  })

  test('正文段距;strong/em/a 各得其所', () => {
    const root = styled('<p>甲<strong>乙</strong><em>丙</em><a href="x">丁</a></p>')
    const p = root.querySelector('p')!
    expect(p.style.margin).not.toBe('')
    expect(root.querySelector('strong')!.style.fontWeight).toBe('600')
    expect(root.querySelector('em')!.style.fontStyle).toBe('italic')
    expect(root.querySelector('a')!.style.color).not.toBe('')
  })

  test('引用块:左竖线 + 浅灰底', () => {
    const q = styled('<blockquote><p>引</p></blockquote>').querySelector<HTMLElement>('blockquote')!
    expect(q.style.borderLeftWidth).not.toBe('')
    expect(q.style.backgroundColor).not.toBe('')
  })

  test('行内码有底有圆角;块级代码 pre-wrap 防撑破且其内 code 不再叠底', () => {
    const root = styled('<p><code>inline</code></p><pre><code>block</code></pre>')
    const inline = root.querySelector<HTMLElement>('p code')!
    expect(inline.style.backgroundColor).not.toBe('')
    expect(inline.style.borderRadius).not.toBe('')
    const pre = root.querySelector<HTMLElement>('pre')!
    expect(pre.style.whiteSpace).toBe('pre-wrap')
    const blockCode = root.querySelector<HTMLElement>('pre code')!
    expect(blockCode.style.backgroundColor).toBe('')
  })

  test('列表:ul/ol 缩进由 padding-left 承担(嵌套自然递进),li 段距', () => {
    const root = styled('<ul><li>a<ul><li>b</li></ul></li></ul>')
    const [outer, inner] = [...root.querySelectorAll<HTMLElement>('ul')]
    expect(outer!.style.paddingLeft).not.toBe('')
    expect(inner!.style.paddingLeft).not.toBe('')
    expect(root.querySelector<HTMLElement>('li')!.style.margin).not.toBe('')
  })

  test('表格:单元格 1px 边框 + 表头浅底', () => {
    const root = styled('<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>')
    expect(root.querySelector<HTMLElement>('th')!.style.border).toContain('1px')
    expect(root.querySelector<HTMLElement>('th')!.style.backgroundColor).not.toBe('')
    expect(root.querySelector<HTMLElement>('td')!.style.border).toContain('1px')
  })

  test('图片限宽居中;hr 换浅色上边线', () => {
    const root = styled('<img src="x.png"><hr>')
    expect(root.querySelector<HTMLElement>('img')!.style.maxWidth).toBe('100%')
    expect(root.querySelector('hr')!.style.borderTopWidth).not.toBe('')
  })
})

describe('buildWechatHtml:渲染容器 → 可粘贴 HTML 串', () => {
  test('取 .vditor-reset 内容为体,标题锚点 id 剥除,外层 section 承担基础排版', () => {
    const rendered = document.createElement('div')
    rendered.innerHTML = '<div class="vditor-reset"><h1 id="zen-h-0">题</h1><p>文</p></div>'
    const html = buildWechatHtml(rendered)
    const sink = document.createElement('div')
    sink.innerHTML = html
    expect(sink.querySelector('section')).not.toBeNull()
    expect(sink.querySelector('section')!.style.fontSize).toBe('15px')
    expect(sink.querySelector('h1')!.id).toBe('')
    expect(sink.querySelector('h1')!.style.fontSize).toBe('20px')
  })

  test('无 .vditor-reset 时以容器自身内容兜底', () => {
    const rendered = document.createElement('div')
    rendered.innerHTML = '<p>裸</p>'
    const html = buildWechatHtml(rendered)
    const sink = document.createElement('div')
    sink.innerHTML = html
    expect(sink.querySelector('p')!.textContent).toBe('裸')
  })

  test('剥 vditor 预览残留:复制按钮壳与零宽测量 span 不进产物(公众号侧大空白元凶)', () => {
    const rendered = document.createElement('div')
    rendered.innerHTML =
      '<div class="vditor-reset"><pre><div class="vditor-copy"><textarea></textarea><span class="vditor-tooltipped"><svg></svg></span></div><code class="language-ts">const a = 1</code><span style="position: absolute">​</span></pre></div>'
    const html = buildWechatHtml(rendered)
    const sink = document.createElement('div')
    sink.innerHTML = html
    expect(sink.querySelector('.vditor-copy')).toBeNull()
    expect(sink.querySelector('textarea')).toBeNull()
    expect(sink.querySelector('svg')).toBeNull()
    // vditor 挂在 code 上的 max-height 等内联残留一并清除(pre 承担全部样式)
    expect(sink.querySelector('pre code')!.getAttribute('style')).toBe('')
    expect(sink.querySelector('code')!.textContent).toBe('const a = 1')
  })
})

// 编排链:仅 mock 渲染(jsdom 不跑 vditor)与 mermaid 成图(无 canvas),插图解析走真
// buildImageMetaFromSrcs + MemoryFsAdapter(真读盘换 dataURL);捕获渲染入参与剪贴板
// 出参断言全链
vi.mock('./vditorPreview', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./vditorPreview')>()
  return {
    ...orig,
    renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
      // 模拟真实 vditor 渲染:包 vditor-reset,mermaid 块按改标后的语言出 code,且非 ASCII src 被百分号编码
      const mermaid = md.includes('zen-mermaid') ? '<pre><code class="language-zen-mermaid">A--&gt;B</code></pre>' : ''
      const hasCn = md.includes('配图')
      el.innerHTML = `<div class="vditor-reset"><p>正文</p>${mermaid}<img src="assets/pic.png">${
        hasCn ? '<img src="assets/%E9%85%8D%E5%9B%BE.png">' : ''
      }</div>`
    }),
  }
})
// mermaid 成图 mock:模拟真管线把 zen-mermaid 代码块换成 dataURL img
vi.mock('./mermaidImage', () => ({
  replaceMermaidCode: vi.fn(async (root: ParentNode) => {
    const code = root.querySelector('code.language-zen-mermaid')
    if (code !== null) {
      const img = document.createElement('img')
      img.src = 'data:image/png;base64,RENGRVJNQUlO'
      code.parentElement?.replaceWith(img)
    }
  }),
}))
import { renderVditorPreview } from './vditorPreview'
import { replaceMermaidCode } from './mermaidImage'

describe('copyAsWechatHtml:读盘 → 预处理 → 渲染 → 插图 → 内联样式 → 剪贴板', () => {
  test('全链:标记/mermaid 预处理进渲染,出参带内联样式与 dataURL 插图,舞台即用即清', async () => {
    const fs = new MemoryFsAdapter()
    const md = [
      '# 标题 [[链]] #tag ::flag',
      '',
      '![图](assets/pic.png)',
      '',
      '![配图](assets/配图.png)',
      '',
      '```mermaid',
      'A-->B',
      '```',
    ].join('\n')
    await fs.writeTextFileAtomic('/ws/文.md', md)
    await fs.writeBytes('/ws/assets/pic.png', new Uint8Array([1, 2, 3]))
    await fs.writeBytes('/ws/assets/配图.png', new Uint8Array([4, 5]))
    const written: string[] = []
    await copyAsWechatHtml(fs, '/ws', '/ws/文.md', async (html) => {
      written.push(html)
    })
    // 渲染入参 = 显示层标记剥净 + mermaid 改标 zen-mermaid
    expect(vi.mocked(renderVditorPreview)).toHaveBeenCalledWith(expect.any(HTMLElement), expect.stringContaining('```zen-mermaid'), 'light')
    const renderedMd = vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]!
    expect(renderedMd).toBe(
      ['# 标题', '', '![图](assets/pic.png)', '', '![配图](assets/配图.png)', '', '```zen-mermaid', 'A-->B', '```'].join('\n'),
    )
    // mermaid 成图管线在编排内被调用,产物 img(内联样式由 applyWechatStyles 补)
    expect(vi.mocked(replaceMermaidCode)).toHaveBeenCalledTimes(1)
    // 剪贴板出参:section 根 + 内联样式 + 插图换 dataURL(含被编码的非 ASCII src)+ mermaid 成图
    expect(written).toHaveLength(1)
    expect(written[0]!).toContain('<section')
    expect(written[0]!).toContain('font-size: 15px')
    expect(written[0]!).toContain('data:image/png;base64,AQID')
    expect(written[0]!).toContain('data:image/png;base64,BAU=')
    expect(written[0]!).toContain('data:image/png;base64,RENGRVJNQUlO')
    // 离屏舞台即用即清,不留痕
    expect(document.querySelector('.wechat-copy-stage')).toBeNull()
  })

  test('读盘失败原样上抛(调用方 setError 兜底),舞台不残留', async () => {
    const fs = new MemoryFsAdapter()
    await expect(
      copyAsWechatHtml(fs, '/ws', '/ws/不存在.md', async () => {
        throw new Error('不应到达')
      }),
    ).rejects.toThrow('文件不存在')
    expect(document.querySelector('.wechat-copy-stage')).toBeNull()
  })
})
