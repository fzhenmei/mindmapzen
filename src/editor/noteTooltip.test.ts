import { afterEach, describe, expect, test, vi } from 'vitest'

// 悬停窗渲染链 mock:注入代表性 DOM 模拟 vditor 预览产物(mermaid svg 在真浏览器验证)
vi.mock('../services/vditorPreview', () => ({
  renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
    el.innerHTML = `<div class="vditor-preview">${md.slice(0, 40)}</div>`
  }),
}))

import { createNoteTooltip } from './noteTooltip'
import { renderVditorPreview } from '../services/vditorPreview'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { useAppStore } from '../store/appStore'

const mocked = vi.mocked(renderVditorPreview)

afterEach(() => {
  mocked.mockClear()
  mocked.mockImplementation(async (el: HTMLElement, md: string) => {
    el.innerHTML = `<div class="vditor-preview">${md.slice(0, 40)}</div>`
  })
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

  test('正文插图(2026-09 相对路径):渲染后相对 src img 换 dataURL(读盘同案头口径)', async () => {
    const fs = new MemoryFsAdapter()
    await fs.writeBytes('/ws/assets/悬停.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    useAppStore.setState({ adapter: fs, workspaceDir: '/ws' })
    // mock 渲染注入带相对 src 的 img(模拟 lute 产物;webview 解析不了相对路径)
    mocked.mockImplementationOnce(async (el: HTMLElement) => {
      const img = document.createElement('img')
      img.src = 'assets/悬停.png'
      el.append(img)
    })
    const tip = createNoteTooltip('light')
    tip.show('带图正文', 0, 0)
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    await vi.waitFor(() =>
      expect(el.querySelector('img')!.src).toBe(`data:image/png;base64,${btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47))}`),
    )
    tip.destroy()
  })
})

describe('noteTooltip:边缘锚点翻转+钳制(2026-09-22 边缘浮层修复)', () => {
  // jsdom 无布局(offsetWidth/Height 恒 0):own-property 桩注入实测尺寸;视口钉 1024×768
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('innerHeight', 768)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('右/下缘放不下时贴锚点往左/上长(fixed+left 的收缩适应盒会被压窄,不能只移位)', () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    Object.defineProperty(el, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: 150, configurable: true })
    tip.show('边缘正文', 900, 650)
    // 左:900+300 > 1024-8 → 右缘贴锚点 900 往左长 → 600;上:650+150 > 768-8 → 650-150=500
    expect(el.style.left).toBe('600px')
    expect(el.style.top).toBe('500px')
    tip.destroy()
  })

  test('异步渲染内容撑高后按新尺寸重判翻转(mermaid/插图换 dataURL 尺寸会变,show 时量的是空盒)', async () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    Object.defineProperty(el, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: 150, configurable: true })
    tip.show('长文', 900, 650)
    expect(el.style.top).toBe('500px')
    // 渲染完成内容高 400:上翻转到 650-400=250
    Object.defineProperty(el, 'offsetHeight', { value: 400, configurable: true })
    await vi.waitFor(() => expect(el.style.top).toBe('250px'))
    expect(el.style.left).toBe('600px')
    tip.destroy()
  })

  test('窄视口翻转后仍左溢:钳底抬到边距(翻转的兜底)', () => {
    vi.stubGlobal('innerWidth', 500)
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    Object.defineProperty(el, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: 150, configurable: true })
    tip.show('窄窗正文', 300, 650)
    // 300+300 > 500-8 翻转 → 300-300=0,仍 < 边距 8 → 钳到 8
    expect(el.style.left).toBe('8px')
    expect(el.style.top).toBe('500px')
    tip.destroy()
  })

  test('宽度 max-content 与位置解耦(测量反馈环防回归:翻转后量到的宽已被当前 left 压小,越移越窄)', () => {
    // 真机复现过:width:auto 的 fixed 盒可用宽=视口-left,翻转到右缘附近后 offsetWidth
    // 读回的是被压后的宽,jsdom 恒定桩测不出——只能靠样式断言防回归
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    expect(el.style.width).toBe('max-content')
    tip.destroy()
  })

  test('左/上缘负锚点抬到边距(不越过视口左上)', () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    Object.defineProperty(el, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: 150, configurable: true })
    tip.show('左上正文', -20, -5)
    expect(el.style.left).toBe('8px')
    expect(el.style.top).toBe('8px')
    tip.destroy()
  })
})

describe('noteTooltip:渲染完成前不可见(2026-09-22 首帧跳变修复)', () => {
  // 真机现象:内容很多时首帧空盒放锚点右侧,渲染完成后按真实宽(60vw 封顶)翻转到
  // 左侧,两次放置间的可见状态 = 用户看到"先右后左闪现"。治本:渲染完成前
  // visibility 藏起(不同于 display:none,hidden 盒仍参与布局、offsetWidth 可量),
  // place 定到最终位置后才显形——两次放置间无可见帧。
  test('show 藏起、渲染完成 place 后才显形', async () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    tip.show('长文', 100, 100)
    expect(el.style.display).toBe('block')
    expect(el.style.visibility).toBe('hidden')
    await vi.waitFor(() => expect(el.textContent).toContain('长文'))
    expect(el.style.visibility).toBe('visible')
    tip.destroy()
  })

  test('渲染失败降级路径同样显形(源码保底也得让用户看见)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocked.mockRejectedValueOnce(new Error('lute 加载失败'))
    const tip = createNoteTooltip('light')
    tip.show('失败正文', 0, 0)
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    await vi.waitFor(() => expect(el.querySelector('pre')!.textContent).toContain('失败正文'))
    expect(el.style.visibility).toBe('visible')
    errSpy.mockRestore()
    tip.destroy()
  })

  test('渲染未完成即切目标:旧渲染迟到不得显形(seq 守卫),新 show 重走藏→显', async () => {
    // A/B 渲染都挂起(手动放行),才能开住"旧渲染迟到"的观察窗:B 未完成前
    // 窗口必为 hidden——A 先放行不得显形,再放行 B 才显形
    let resolveA!: () => void
    let resolveB!: () => void
    mocked
      .mockImplementationOnce(() => new Promise<void>((res) => (resolveA = res)))
      .mockImplementationOnce(
        (el: HTMLElement) =>
          new Promise<void>((res) => {
            resolveB = () => {
              el.textContent = 'B 正文'
              res()
            }
          }),
      )
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    tip.show('A 正文', 100, 100)
    expect(el.style.visibility).toBe('hidden')
    tip.show('B 正文', 100, 100) // A 渲染挂起中切 B
    resolveA() // A 迟到完成:seq 已变,不得显形/覆盖内容
    await new Promise((r) => setTimeout(r, 0))
    expect(el.style.visibility).toBe('hidden')
    resolveB() // B 完成:place 后显形
    await vi.waitFor(() => expect(el.textContent).toContain('B 正文'))
    expect(el.style.visibility).toBe('visible')
    tip.destroy()
  })
})
