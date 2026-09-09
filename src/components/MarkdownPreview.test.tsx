import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

// jsdom 不跑 vditor 真实渲染:mock renderVditorPreview 往容器注入代表性 DOM,
// 断言后处理(imgMap 换 src / 锚点注入)在渲染完成后正确执行
vi.mock('../services/vditorPreview', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../services/vditorPreview')>()
  return {
    ...orig,
    renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
      el.innerHTML = `<h1>${md.split('\n')[0]!.replace(/^# /, '')}</h1><img src="pic.png">`
    }),
  }
})
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn((sel: (s: { resolvedTheme: 'light' | 'dark' }) => unknown) =>
    sel({ resolvedTheme: 'light' })),
}))

import MarkdownPreview from './MarkdownPreview'
import { renderVditorPreview } from '../services/vditorPreview'

describe('MarkdownPreview:lute 渲染 + DOM 后处理', () => {
  test('渲染完成后的后处理:插图换 dataURL、标题注锚点(与 mdOutline 文档序对齐)', async () => {
    render(<MarkdownPreview text="# 标题" imgMap={new Map([['pic.png', 'data:image/png;base64,zz']])} />)
    await screen.findByTestId('md-preview')
    // 等渲染 promise 排空后断言后处理已执行
    await Promise.resolve()
    const root = screen.getByTestId('md-preview')
    expect(root.querySelector('h1')!.id).toBe('zen-h-0') // mdOutline('# 标题') = 1 个标题
    expect(root.querySelector('img')!.src).toBe('data:image/png;base64,zz')
    expect(vi.mocked(renderVditorPreview)).toHaveBeenCalledWith(root, '# 标题', 'light')
  })

  test('连线标记剥离先于渲染(与画布显示层同口径)', async () => {
    render(<MarkdownPreview text={'# 见 [[B]]'} />)
    await screen.findByTestId('md-preview')
    await Promise.resolve()
    // stripMarkers 整段删除 [[..]] 标记(linkMarkers 既有钉死口径:'见 [[A]] 和 [[B]]'
    // → '见 和'),故剥离结果为 '# 见'——brief 原断言值 '# 见 B' 与该口径矛盾,已按行为修正
    expect(vi.mocked(renderVditorPreview)).toHaveBeenLastCalledWith(expect.any(HTMLElement), '# 见', 'light')
  })
})
