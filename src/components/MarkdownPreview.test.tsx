import { render, screen, waitFor } from '@testing-library/react'
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
    // 渲染经内部队列串行异步完成,waitFor 等后处理落地再断言(裸 Promise.resolve
    // 在队列链上加深度后不再可靠)
    const root = await screen.findByTestId('md-preview')
    await waitFor(() => expect(root.querySelector('h1')!.id).toBe('zen-h-0')) // mdOutline('# 标题') = 1 个标题
    expect(root.querySelector('img')!.src).toBe('data:image/png;base64,zz')
    expect(vi.mocked(renderVditorPreview)).toHaveBeenCalledWith(root, '# 标题', 'light')
  })

  test('连线标记剥离先于渲染(与画布显示层同口径)', async () => {
    render(<MarkdownPreview text={'# 见 [[B]]'} />)
    await screen.findByTestId('md-preview')
    // stripMarkers 整段删除 [[..]] 标记(linkMarkers 既有钉死口径:'见 [[A]] 和 [[B]]'
    // → '见 和'),故剥离结果为 '# 见'——brief 原断言值 '# 见 B' 与该口径矛盾,已按行为修正
    await waitFor(() =>
      expect(vi.mocked(renderVditorPreview)).toHaveBeenLastCalledWith(expect.any(HTMLElement), '# 见', 'light'),
    )
  })

  test('终审 I1 竞态回归:连续渲染串行排队——旧渲染晚完成不清空新内容,最终 DOM 为最新值', async () => {
    // 手控 fake 模拟 vditor addScript 加载窗内两回调乱序完成:每次调用返回挂起
    // promise,resolve 时才把文本写入容器(与 VDitor.preview 异步写 DOM 同构)。
    // 生产暴露路径:工具轮 finalize 挂 md(空文本首渲染)后第二轮 delta 密集重渲染
    const calls: Array<{ el: HTMLElement; md: string; finish(): void }> = []
    const manualRender = (el: HTMLElement, md: string): Promise<void> =>
      new Promise<void>((resolve) => {
        calls.push({ el, md, finish: () => { el.textContent = md; resolve() } })
      })
    vi.mocked(renderVditorPreview).mockImplementationOnce(manualRender).mockImplementationOnce(manualRender)
    const { rerender } = render(<MarkdownPreview text="" />)
    await waitFor(() => expect(calls).toHaveLength(1)) // 空文本渲染先发且在途
    rerender(<MarkdownPreview text="第二轮文本" />)
    await Promise.resolve()
    // 串行化:第一个渲染仍在途时第二个不得发起——并发即 addScript 竞态温床
    // (旧实现此处已是 2 次并发调用,空串后完成即 innerHTML='' 清掉已填文本)
    expect(calls).toHaveLength(1)
    calls[0]!.finish() // 旧渲染(空文本)此刻才完成——晚于新值到达,但其写入先于新渲染
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.md).toBe('第二轮文本') // 最新值胜出:排队任务执行时取当前最新内容
    calls[1]!.finish()
    await waitFor(() => expect(screen.getByTestId('md-preview')).toHaveTextContent('第二轮文本'))
    expect(calls).toHaveLength(2) // 无清空窗口:队列已排空,再无渲染把新内容抹掉
  })
})
