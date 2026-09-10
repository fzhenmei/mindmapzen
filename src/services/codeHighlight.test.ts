// src/services/codeHighlight.test.ts —— 代码块语法高亮单测:jsdom 不跑真 hljs,
// 经依赖注入替换加载器;断言 token 切分回填与类名→内联色映射、未知语言跳过、
// 失败降级不阻塞,以及微信发布形态(br/nbsp/单一块级包裹)与预览形态的差异
import { describe, expect, test, vi } from 'vitest'
import { highlightCodeBlocks, type HighlightDeps } from './codeHighlight'

/** 伪 hljs:getLanguage 认 ts/python,highlight 回固定 token 结构 */
function fakeHljs() {
  return {
    getLanguage: (name: string) => (name === 'ts' || name === 'python' ? { name } : null),
    highlight: (code: string, opts: { language: string }) => ({
      value:
        opts.language === 'ts'
          ? `<span class="hljs-keyword">const</span> ${code.replace(/^const /, '')}<span class="hljs-string">"hi"</span>`
          : `<span class="hljs-keyword">def</span> ${code}`,
    }),
  }
}

describe('highlightCodeBlocks:pre>code 语法高亮内联化', () => {
  test('token 切分回填 + 类名映射内联色(公众号剥 class,色值必须内联)', async () => {
    const deps: HighlightDeps = { load: async () => fakeHljs() }
    const root = document.createElement('div')
    // 真实形态:class 是 "language-ts hljs" 多类(vditor 渲染时即带上 hljs 标记)
    root.innerHTML = '<pre><code class="language-ts hljs">const x = </code></pre>'
    await highlightCodeBlocks(root, deps)
    const code = root.querySelector('code')!
    expect(code.innerHTML).toContain('hljs-keyword')
    const keyword = code.querySelector<HTMLElement>('.hljs-keyword')!
    expect(keyword.style.color).not.toBe('')
    const str = code.querySelector<HTMLElement>('.hljs-string')!
    expect(str.style.color).not.toBe('')
    expect(str.style.color).not.toBe(keyword.style.color) // 关键字红/字符串蓝,映射生效
  })

  test('未知语言(如降级残留的 zen-mermaid)跳过:内容原样纯文本', async () => {
    const deps: HighlightDeps = { load: async () => fakeHljs() }
    const root = document.createElement('div')
    root.innerHTML = '<pre><code class="language-zen-mermaid">graph TD</code></pre>'
    await highlightCodeBlocks(root, deps)
    expect(root.querySelector('code')!.textContent).toBe('graph TD')
    expect(root.querySelector('code')!.querySelector('span')).toBeNull()
  })

  test('highlight 抛错降级:该块保持纯文本不上抛(显式日志出口)', async () => {
    const deps: HighlightDeps = {
      load: async () => ({
        getLanguage: () => ({ name: 'x' }),
        highlight: () => {
          throw new Error('boom')
        },
      }),
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const root = document.createElement('div')
      root.innerHTML = '<pre><code class="language-ts">const a</code></pre>'
      await expect(highlightCodeBlocks(root, deps)).resolves.toBeUndefined()
      expect(root.querySelector('code')!.textContent).toBe('const a')
      expect(errSpy).toHaveBeenCalled()
    } finally {
      errSpy.mockRestore()
    }
  })

  test('无代码块快速路径:不加载脚本', async () => {
    const deps: HighlightDeps = { load: vi.fn(async () => fakeHljs()) }
    const root = document.createElement('div')
    root.innerHTML = '<p>纯文本</p>'
    await highlightCodeBlocks(root, deps)
    expect(deps.load).not.toHaveBeenCalled()
  })

  test('微信形态(发布复制):换行全转 br、空格全量 nbsp、单一 display:block 包裹(doocs/md 实战公式)', async () => {
    const deps: HighlightDeps = {
      load: async () => ({
        getLanguage: () => ({ name: 'x' }),
        highlight: () => ({
          value: '<span class="hljs-keyword">export</span> const copyForWechat = <span class="hljs-string">"泽"</span>\n    indent\n',
        }),
      }),
    }
    const root = document.createElement('div')
    root.innerHTML = '<pre><code class="language-ts">x</code></pre>'
    await highlightCodeBlocks(root, deps)
    const code = root.querySelector('code')!
    // 无 \n 文本节点(全转 br),无普通空格(全量 nbsp,含行内与行首)
    expect(code.textContent).not.toContain('\n')
    expect(code.textContent).not.toContain(' ')
    expect(code.querySelectorAll('br').length).toBeGreaterThan(0)
    expect(code.textContent).toContain('copyForWechat')
    // 单一 display:block 包裹(微信代码块 -webkit-box,多子元素横排打乱)
    const wrap = code.querySelector<HTMLElement>('span[style*="display: block"]')
    expect(wrap).not.toBeNull()
    expect([...code.children].filter((el) => el !== wrap)).toHaveLength(0)
  })

  test('多行缩进代码(br 数按行数,空格全 nbsp)', async () => {
    const deps: HighlightDeps = {
      load: async () => ({
        getLanguage: () => ({ name: 'x' }),
        highlight: () => ({ value: 'def hi():\n    return 1\n' }),
      }),
    }
    const root = document.createElement('div')
    root.innerHTML = '<pre><code class="language-ts hljs">def hi():</code></pre>'
    await highlightCodeBlocks(root, deps)
    const code = root.querySelector('code')!
    expect(code.textContent).not.toContain(' ')
    expect(code.textContent).not.toContain('\n')
    // 2 个换行处 → 2 个 br(值以 \n 结尾产生的空尾段不额外产 br)
    expect(code.querySelectorAll('br')).toHaveLength(2)
  })

  test('预览形态(inlineColors:false):出 token span 但不上内联色、不做微信形态转换', async () => {
    const deps: HighlightDeps = {
      load: async () => ({
        getLanguage: () => ({ name: 'x' }),
        highlight: () => ({ value: '<span class="hljs-keyword">def</span> hi:\n    x\n' }),
      }),
    }
    const root = document.createElement('div')
    root.innerHTML = '<pre><code class="language-ts">def</code></pre>'
    await highlightCodeBlocks(root, deps, { inlineColors: false })
    const code = root.querySelector('code')!
    expect(code.querySelector('span[class]')).not.toBeNull() // token 在(类名着色交 CSS)
    expect(code.querySelector<HTMLElement>('.hljs-keyword')!.style.color).toBe('') // 无内联色
    expect(code.innerHTML).toContain(':\n    x') // 普通空格与换行保留(不做微信转换)
  })
})
