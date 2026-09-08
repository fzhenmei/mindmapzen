import { afterEach, describe, expect, test, vi } from 'vitest'

// 悬停窗渲染链 mock:注入代表性 DOM 模拟 vditor 预览产物(mermaid svg 在真浏览器验证)
vi.mock('../services/vditorPreview', () => ({
  renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
    el.innerHTML = `<div class="vditor-preview">${md.slice(0, 40)}</div>`
  }),
}))

import { createNoteTooltip } from './noteTooltip'
import { renderVditorPreview } from '../services/vditorPreview'

const mocked = vi.mocked(renderVditorPreview)

afterEach(() => {
  mocked.mockClear()
  document.querySelectorAll('.zen-note-tip').forEach((el) => el.remove())
})

describe('noteTooltip:lute 渲染 + 限高滚动(2026-09 渲染统一)', () => {
  test('show:调 renderVditorPreview(note 原文/light),more 行引导开编辑弹窗', async () => {
    const tip = createNoteTooltip('light')
    tip.show('说明文字', 10, 20)
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    expect(el.style.display).toBe('block')
    await vi.waitFor(() => expect(el.textContent).toContain('说明文字'))
    expect(mocked).toHaveBeenLastCalledWith(el, '说明文字', 'light')
    expect(el.querySelector('.zen-note-tip-more')!.textContent).toContain('Shift+F2')
    tip.destroy()
  })

  test('限高滚动:容器带 max-height 与 overflow(300 字截断退役,md 按字符截断会截破语法)', () => {
    const tip = createNoteTooltip('light')
    tip.show('x'.repeat(500), 0, 0)
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    expect(el.style.maxHeight).not.toBe('')
    expect(el.style.overflowY).toBe('auto')
    tip.destroy()
  })

  test('渲染失败降级源码保底 + console.error 显式出口(禁止吞异常)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocked.mockRejectedValueOnce(new Error('lute 加载失败'))
    const tip = createNoteTooltip('light')
    tip.show('失败正文', 0, 0)
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    await vi.waitFor(() => expect(el.querySelector('pre')!.textContent).toContain('失败正文'))
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    tip.destroy()
  })

  test('hide:隐藏并清内容;setTheme 显示中按新主题重渲染', async () => {
    const tip = createNoteTooltip('light')
    tip.show('内容', 0, 0)
    await vi.waitFor(() => expect(mocked).toHaveBeenCalled())
    tip.setTheme('dark') // 显示中(display 非 none)→ 按新主题重渲染
    expect(mocked).toHaveBeenLastCalledWith(expect.any(HTMLElement), '内容', 'dark')
    tip.hide()
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    expect(el.style.display).toBe('none')
    expect(el.textContent).toBe('')
    tip.destroy()
  })
})
