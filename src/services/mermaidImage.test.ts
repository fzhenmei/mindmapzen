// src/services/mermaidImage.test.ts —— mermaid 成图编排单测:jsdom 无 canvas,
// 脚本加载与 SVG 光栅化经依赖注入替换,断言替换/降级/快速路径三路
import { describe, expect, test, vi } from 'vitest'
import { foreignObjectToText, replaceMermaidCode, type MermaidDeps } from './mermaidImage'

/** 伪 mermaid:记录 initialize 配置,render 按入参回固定 svg */
function fakeMermaid() {
  const initCfgs: Record<string, unknown>[] = []
  const rendered: string[] = []
  return {
    initCfgs,
    rendered,
    mermaid: {
      initialize: (cfg: Record<string, unknown>) => initCfgs.push(cfg),
      render: async (id: string, text: string) => {
        rendered.push(text)
        return { svg: `<svg id="${id}" width="10" height="10"></svg>` }
      },
    },
  }
}

const rasterStub = 'data:image/png;base64,ZmFrZQ=='

describe('replaceMermaidCode:zen-mermaid 代码块 → PNG dataURL img', () => {
  test('逐块替换:initialize 关 htmlLabels/useMaxWidth,pre 整体换 img', async () => {
    const fake = fakeMermaid()
    const deps: MermaidDeps = {
      load: async () => fake.mermaid,
      rasterize: async () => rasterStub,
    }
    const root = document.createElement('div')
    root.innerHTML = '<p>文</p><pre><code class="language-zen-mermaid">graph TD</code></pre>'
    await replaceMermaidCode(root, deps)
    expect(fake.rendered).toEqual(['graph TD'])
    // initialize 配置:htmlLabels:false(无 foreignObject,canvas 可光栅化)、useMaxWidth:false(svg 带显式宽高)
    expect(fake.initCfgs).toHaveLength(1)
    expect((fake.initCfgs[0]!.flowchart as Record<string, unknown>).htmlLabels).toBe(false)
    expect((fake.initCfgs[0]!.flowchart as Record<string, unknown>).useMaxWidth).toBe(false)
    // pre 整体被 img 替换,src 为 dataURL
    expect(root.querySelector('pre')).toBeNull()
    const img = root.querySelector('img')!
    expect(img.getAttribute('src')).toBe(rasterStub)
    expect(root.querySelector('p')).not.toBeNull()
  })

  test('单块失败降级:保留该 pre 代码块,其余块照常成图', async () => {
    const fake = fakeMermaid()
    const deps: MermaidDeps = {
      load: async () => ({
        initialize: fake.mermaid.initialize,
        render: async (_id, text) => {
          if (text.includes('坏')) throw new Error('parse error')
          return { svg: '<svg width="1" height="1"></svg>' }
        },
      }),
      rasterize: async () => rasterStub,
    }
    const root = document.createElement('div')
    root.innerHTML =
      '<pre><code class="language-zen-mermaid">坏图</code></pre><pre><code class="language-zen-mermaid">好图</code></pre>'
    await replaceMermaidCode(root, deps)
    const pres = root.querySelectorAll('pre')
    expect(pres).toHaveLength(1)
    expect(pres[0]!.textContent).toBe('坏图')
    expect(root.querySelector('img')).not.toBeNull()
  })

  test('脚本加载失败:全部保留代码块且不上抛(降级,显式日志出口)', async () => {
    const deps: MermaidDeps = {
      load: async () => {
        throw new Error('script fail')
      },
      rasterize: async () => rasterStub,
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const root = document.createElement('div')
      root.innerHTML = '<pre><code class="language-zen-mermaid">graph TD</code></pre>'
      await expect(replaceMermaidCode(root, deps)).resolves.toBeUndefined()
      expect(root.querySelectorAll('pre')).toHaveLength(1)
      expect(errSpy).toHaveBeenCalled()
    } finally {
      errSpy.mockRestore()
    }
  })

  test('无 mermaid 块快速路径:不加载脚本', async () => {
    const deps: MermaidDeps = {
      load: vi.fn(async () => fakeMermaid().mermaid),
      rasterize: vi.fn(async () => rasterStub),
    }
    const root = document.createElement('div')
    root.innerHTML = '<p>纯文本</p>'
    await replaceMermaidCode(root, deps)
    expect(deps.load).not.toHaveBeenCalled()
    expect(deps.rasterize).not.toHaveBeenCalled()
  })

  test('foreignObject 在光栅化前被手术为 text(Chromium 对含 FO 的 SVG 转 canvas 必污染)', async () => {
    const fake = fakeMermaid()
    const seen: string[] = []
    const deps: MermaidDeps = {
      load: async () => fake.mermaid,
      rasterize: async (svg) => {
        seen.push(svg)
        return rasterStub
      },
    }
    const root = document.createElement('div')
    root.innerHTML = '<pre><code class="language-zen-mermaid">graph TD</code></pre>'
    await replaceMermaidCode(root, deps)
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toContain('foreignObject')
  })
})

describe('foreignObjectToText:FO 手术为居中 text(纯字符串函数)', () => {
  const svgWithFo = (inner: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><g transform="translate(10,10)"><foreignObject width="20" height="24">${inner}</foreignObject></g></svg>`

  test('单行标签:FO 换 text,tspan 居中承载文本,父级结构不动', () => {
    const out = foreignObjectToText(svgWithFo('<div xmlns="http://www.w3.org/1999/xhtml">A</div>'))
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    expect(doc.querySelector('foreignObject')).toBeNull()
    const text = doc.querySelector('text')!
    expect(text.getAttribute('text-anchor')).toBe('middle')
    const tspan = text.querySelector('tspan')!
    expect(tspan.textContent).toBe('A')
    expect(tspan.getAttribute('x')).toBe('10') // width 20 / 2
    expect(doc.querySelector('g')?.getAttribute('transform')).toBe('translate(10,10)')
  })

  test('多行标签(<br> 分段):逐行 tspan,纵向整体居中', () => {
    const out = foreignObjectToText(
      svgWithFo('<div xmlns="http://www.w3.org/1999/xhtml">甲<br/>乙</div>'),
    )
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
    const tspans = Array.from(doc.querySelectorAll('tspan'))
    expect(tspans.map((t) => t.textContent)).toEqual(['甲', '乙'])
    // 高 24 两行:行高 12,首行 y = 12 - 6 = 6? h/2 ± 行高半距 → 12±6
    expect(tspans[0]!.getAttribute('y')).toBe('6')
    expect(tspans[1]!.getAttribute('y')).toBe('18')
  })

  test('无 FO 原样返回(不触碰)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text></svg>'
    expect(foreignObjectToText(svg)).toBe(svg)
  })
})
