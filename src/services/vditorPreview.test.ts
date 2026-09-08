import { beforeEach, describe, expect, test, vi } from 'vitest'

// jsdom 不执行 vditor 注入的 script 资源加载,真实渲染归 e2e;单测 mock VDitor.preview
// 锁参数契约(cdn 本地化与主题映射是离线与双主题的命门),后处理函数是纯 DOM 可真实测
vi.mock('vditor', () => ({ default: { preview: vi.fn().mockResolvedValue(undefined) } }))

import Vditor from 'vditor'
import { applyImageMap, injectHeadingAnchors, renderVditorPreview, VDITOR_CDN } from './vditorPreview'

const mocked = vi.mocked(Vditor.preview)

describe('renderVditorPreview:VDitor.preview 参数契约', () => {
  beforeEach(() => mocked.mockClear())

  test('传容器与原文,cdn 指向本地 vendor,light 主题映射 mode', async () => {
    const el = document.createElement('div')
    await renderVditorPreview(el, '# 标题', 'light')
    expect(mocked).toHaveBeenCalledWith(el, '# 标题', expect.objectContaining({ cdn: VDITOR_CDN, mode: 'light' }))
    expect(VDITOR_CDN).toBe('vendor/vditor')
  })

  test('dark 主题映射 mode=dark', async () => {
    const el = document.createElement('div')
    await renderVditorPreview(el, 'x', 'dark')
    expect(mocked).toHaveBeenCalledWith(el, 'x', expect.objectContaining({ mode: 'dark' }))
  })
})

describe('applyImageMap:插图 src 解析(M19 沿用)', () => {
  test('命中 imgMap 换 dataURL,未命中原样', () => {
    const root = document.createElement('div')
    root.innerHTML = '<img src="a.png"><img src="https://ext/b.png">'
    applyImageMap(root, new Map([['a.png', 'data:image/png;base64,xxx']]))
    expect(root.querySelector<HTMLImageElement>('img[src="a.png"]')).toBeNull() // 已换
    expect(root.querySelectorAll('img')[0]!.src).toBe('data:image/png;base64,xxx')
    expect(root.querySelectorAll('img')[1]!.getAttribute('src')).toBe('https://ext/b.png')
  })
})

describe('injectHeadingAnchors:大纲锚点注入(数量守卫)', () => {
  test('DOM 标题数与大纲一致时按文档序注入 id', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h1>a</h1><h2>b</h2><h3>code 内不算</h3>'
    injectHeadingAnchors(root, [{ id: 'zen-h-0' }, { id: 'zen-h-1' }, { id: 'zen-h-2' }])
    expect(root.querySelector('h1')!.id).toBe('zen-h-0')
    expect(root.querySelector('h3')!.id).toBe('zen-h-2')
  })

  test('数量不等(解析器分歧)保守跳过——不错位比缺锚点更糟', () => {
    const root = document.createElement('div')
    root.innerHTML = '<h1>a</h1><h2>b</h2>'
    injectHeadingAnchors(root, [{ id: 'zen-h-0' }])
    expect(root.querySelector('h1')!.id).toBe('')
    expect(root.querySelector('h2')!.id).toBe('')
  })
})
