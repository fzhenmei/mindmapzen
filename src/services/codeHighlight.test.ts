// src/services/codeHighlight.test.ts —— 代码块语法高亮单测:jsdom 不跑真 hljs,
// 经依赖注入替换加载器;断言 token 切分回填与类名→内联色映射、未知语言跳过、
// 失败降级不阻塞三路
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
})
