// src/services/publishBody.test.ts —— 共享渲染中段单测(2026-09-23 导出 Word/PDF spec §2.1):
// 防炸包装解包(贴来的结构行按原生元素渲染)/手写真引用保留/插图换 dataURL/舞台即用即清。
// 渲染走 mock 注入代表性 DOM(jsdom 不跑 vditor),mermaid 成图 no-op;插图解析走真
// buildImageMetaFromSrcs + MemoryFsAdapter(真读盘换 dataURL)
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { renderPublishBody } from './publishBody'
import { renderVditorPreview } from './vditorPreview'

vi.mock('./vditorPreview', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./vditorPreview')>()
  return {
    ...orig,
    // 模拟真实 vditor:按解包后的结构渲染(标题→h2、真引用→blockquote),插图按 src 出 img
    renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
      const parts: string[] = ['<p>正文</p>']
      if (md.includes('## 贴来的标题')) parts.push('<h2>贴来的标题</h2>')
      if (md.includes('> 引文')) parts.push('<blockquote><p>引文</p></blockquote>')
      if (md.includes('![图](assets/pic.png)')) parts.push('<img src="assets/pic.png">')
      el.innerHTML = `<div class="vditor-reset">${parts.join('')}</div>`
    }),
  }
})
vi.mock('./mermaidImage', () => ({ replaceMermaidCode: vi.fn(async () => {}) }))

describe('renderPublishBody:共享渲染中段(公众号复制/导出 Word/导出 PDF 三链汇合)', () => {
  afterEach(() => vi.clearAllMocks())

  test('防炸包装解包:包装层正文按原生元素进渲染(标题不带 > 前缀),产物无包装 blockquote', async () => {
    const fs = new MemoryFsAdapter()
    const body = await renderPublishBody(fs, null, ['# 标题', '', '> 段落。', '>', '> ## 贴来的标题', ''].join('\n'))
    const renderedMd = vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]!
    expect(renderedMd).toContain('## 贴来的标题')
    expect(renderedMd).not.toContain('> ##')
    expect(body.querySelector('h2')!.textContent).toBe('贴来的标题')
  })

  test('手写真引用保留:剥一级后无结构行不判包装,blockquote 到达产物', async () => {
    const fs = new MemoryFsAdapter()
    const body = await renderPublishBody(fs, null, '# 标题\n\n> 引文')
    expect(vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]).toContain('> 引文')
    expect(body.querySelector('blockquote')).not.toBeNull()
  })

  test('插图换 dataURL:真读盘链在编排内生效(含非 ASCII src 百分号解码比对)', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeBytes('/ws/assets/pic.png', new Uint8Array([1, 2, 3]))
    const body = await renderPublishBody(fs, '/ws', '# 标题\n\n![图](assets/pic.png)')
    expect(body.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AQID')
  })

  test('mermaid 改标进渲染:```mermaid → ```zen-mermaid(vditor 无此适配器防竞态)', async () => {
    const fs = new MemoryFsAdapter()
    await renderPublishBody(fs, null, ['```mermaid', 'A-->B', '```'].join('\n'))
    expect(vi.mocked(renderVditorPreview).mock.calls.at(-1)![1]).toContain('```zen-mermaid')
  })

  test('离屏舞台即用即清,不留痕', async () => {
    const fs = new MemoryFsAdapter()
    await renderPublishBody(fs, null, '# 标题')
    expect(document.querySelector('.wechat-copy-stage')).toBeNull()
  })
})
