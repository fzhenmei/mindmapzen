// src/services/codeHighlight.test.ts —— 代码块语法高亮单测:jsdom 不跑真 hljs,
// 经依赖注入替换加载器;断言 token 切分回填与类名→内联色映射、未知语言跳过、
// 失败降级不阻塞三路
import { describe, expect, test, vi } from 'vitest'
import { hardenLeadingSpaces, highlightCodeBlocks, type HighlightDeps } from './codeHighlight'

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

  test('裸文本节点包 span:token 之间的裸文本不留直接文本子节点(公众号粘贴会提升成独立 leaf 块)', async () => {
    const deps: HighlightDeps = {
      load: async () => ({
        getLanguage: () => ({ name: 'x' }),
        highlight: () => ({ value: '<span class="hljs-keyword">const</span> bare = <span class="hljs-string">"x"</span>\n' }),
      }),
    }
    const root = document.createElement('div')
    root.innerHTML = '<pre><code class="language-ts">const</code></pre>'
    await highlightCodeBlocks(root, deps)
    const code = root.querySelector('code')!
    const bareText = Array.from(code.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE)
    expect(bareText).toHaveLength(0) // 全部包进 span
    // 包裹后文本内容一字不差
    expect(code.textContent).toBe('const bare = "x"\n')
  })

  test('预览形态(inlineColors:false):出 token span 但不上内联色、不硬化空格', async () => {
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
    expect(code.innerHTML).toContain(':\n    x') // 普通空格保留(不硬化)
  })

  test('高亮产物行首空格硬化为 nbsp(公众号粘贴会归一化行首普通空格文本节点)', async () => {
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
    // jsdom 序列化 nbsp 为实体;文本形态是等量 nbsp(渲染同为空格)
    expect(code.innerHTML).toContain(':\n&nbsp;&nbsp;&nbsp;&nbsp;return')
    expect(code.textContent).toBe("def hi():\n    return 1\n")
  })
})

describe('hardenLeadingSpaces:行首空格 → nbsp(纯字符串函数)', () => {
  test('逐行行首连续空格替换为等量 nbsp,行内空格不动', () => {
    expect(hardenLeadingSpaces('a\n  b\n    c d\n e')).toBe('a\n  b\n    c d\n e')
  })

  test('无行首空格与空串原样', () => {
    expect(hardenLeadingSpaces('ab cd\nef')).toBe('ab cd\nef')
    expect(hardenLeadingSpaces('')).toBe('')
  })
})
