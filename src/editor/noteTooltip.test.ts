import { afterEach, describe, expect, test, vi } from 'vitest'

// 悬停窗渲染链 mock:注入代表性 DOM 模拟 vditor 预览产物(mermaid svg 在真浏览器验证)
vi.mock('../services/vditorPreview', () => ({
  renderVditorPreview: vi.fn(async (el: HTMLElement, md: string) => {
    el.innerHTML = `<div class="vditor-preview">${md.slice(0, 40)}</div>`
  }),
}))

import { createNoteTooltip, HIDE_GRACE_MS } from './noteTooltip'
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
    const body = el.querySelector<HTMLElement>('.zen-note-tip-body')!
    expect(el.style.display).toBe('flex') // 外壳 flex 列:内容区+more 行
    await vi.waitFor(() => expect(body.textContent).toContain('说明文字'))
    expect(mocked).toHaveBeenLastCalledWith(body, '说明文字', 'light')
    expect(el.querySelector('.zen-note-tip-more')!.textContent).toContain('Shift+F2')
    tip.destroy()
  })

  test('限高滚动:外壳限高+内容区独立滚动(300 字截断退役,md 按字符截断会截破语法)', () => {
    const tip = createNoteTooltip('light')
    tip.show('x'.repeat(500), 0, 0)
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    const body = el.querySelector<HTMLElement>('.zen-note-tip-body')!
    expect(el.style.maxHeight).not.toBe('') // 外壳 40vh 封顶
    expect(body.style.overflowY).toBe('auto') // 滚动落内容区
    expect(body.style.minHeight).toBe('0px') // flex 子项可滚前提
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

  test('hide:防抖到点隐藏并清内容;setTheme 显示中按新主题重渲染', async () => {
    const tip = createNoteTooltip('light')
    tip.show('内容', 0, 0)
    await vi.waitFor(() => expect(mocked).toHaveBeenCalled())
    tip.setTheme('dark') // 显示中(display 非 none)→ 按新主题重渲染
    expect(mocked).toHaveBeenLastCalledWith(expect.any(HTMLElement), '内容', 'dark')
    // hide 已是防抖语义(指针守卫):真 timers 下 waitFor 完再切 fake 推进 grace 窗
    vi.useFakeTimers()
    tip.hide()
    vi.advanceTimersByTime(HIDE_GRACE_MS)
    vi.useRealTimers()
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    expect(el.style.display).toBe('none')
    // 只清内容区;more 行与内容区是常驻结构,hide 不拆
    expect(el.querySelector<HTMLElement>('.zen-note-tip-body')!.textContent).toBe('')
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
    expect(el.style.display).toBe('flex')
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

describe('noteTooltip:指针在浮层上不关闭+滚动查看(2026-09-22)', () => {
  // 引擎在角标 mouseout 即调 hide,浮层挂 body 不在角标子树内——鼠标移向浮层途中
  // 必触发 mouseout,浮层立即关闭没法滚也没法把鼠标放上去。hide 改 200ms 防抖:
  // 到点指针在浮层 rect 内则不藏(转入浮层 mouseleave 管理),grace 期间 show 打断。
  const GRACE = HIDE_GRACE_MS
  // jsdom 量测桩(getBoundingClientRect 恒 0):stub 出浮层 rect (100,50)-(500,250)
  const stubRect = (el: HTMLElement): void => {
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        left: 100, top: 50, right: 500, bottom: 250, width: 400, height: 200, x: 100, y: 50,
        toJSON: () => ({}),
      }),
      configurable: true,
    })
  }
  const movePointer = (x: number, y: number): void => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }))
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.querySelectorAll('.zen-note-tip').forEach((el) => el.remove())
  })

  test('hide 防抖到点指针在浮层内:不藏,可把鼠标放上去滚动', () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    stubRect(el)
    tip.show('长文', 300, 200)
    movePointer(300, 150) // 指针进浮层 rect
    tip.hide() // 引擎角标 mouseout 到来
    vi.advanceTimersByTime(GRACE)
    expect(el.style.display).toBe('flex') // 不藏
    tip.destroy()
  })

  test('指针不在浮层内:hide 防抖到点真藏(移开即关,略带 200ms 迟滞)', () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    stubRect(el)
    tip.show('长文', 300, 200)
    movePointer(700, 400) // 界外
    tip.hide()
    expect(el.style.display).toBe('flex') // 防抖期内未藏
    vi.advanceTimersByTime(GRACE)
    expect(el.style.display).toBe('none')
    tip.destroy()
  })

  test('浮层 mouseleave 后防抖到点藏;grace 期间 show 打断不藏', () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    stubRect(el)
    // 在浮层内 hide → 不藏;随后指针离场触发浮层 mouseleave → 防抖到点藏
    tip.show('甲', 300, 200)
    movePointer(300, 150)
    tip.hide()
    vi.advanceTimersByTime(GRACE)
    movePointer(700, 400)
    el.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(GRACE - 1)
    expect(el.style.display).toBe('flex')
    vi.advanceTimersByTime(1)
    expect(el.style.display).toBe('none')
    // grace 期间 show 打断:hover 切换节点不闪藏
    tip.show('乙', 300, 200)
    movePointer(700, 400)
    tip.hide()
    vi.advanceTimersByTime(GRACE - 50)
    tip.show('丙', 300, 200) // 打断 pending 隐藏
    vi.advanceTimersByTime(GRACE)
    expect(el.style.display).toBe('flex')
    tip.destroy()
  })

  test('Esc 立即藏(无防抖);目标为输入元素时不拦截(留给节点编辑框)', () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    stubRect(el)
    tip.show('长文', 300, 200)
    movePointer(300, 150) // 指针在浮层内(防抖不会关)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(el.style.display).toBe('none') // Esc 无条件立即藏
    // 输入元素上的 Esc 不拦截
    tip.show('长文', 300, 200)
    const ta = document.createElement('textarea')
    document.body.append(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(el.style.display).toBe('flex')
    ta.remove()
    tip.destroy()
  })
})

describe('noteTooltip:同 note 重复 show 幂等 + more 行常显(2026-09-22 闪烁修复)', () => {
  // 真机闪烁根因:引擎角标是 SVG group(透明 Rect+icon 两子元素),mouseover/mouseout
  // 走 DOM 冒泡——指针在角标内子元素间微移会成对触发 mouseout→hide+mouseover→show。
  // show 对同 note 也全量重渲染(textContent='' + visibility 两段式),浮层整个消失
  // 再出现 = 闪烁(首帧两段式显形引入的回归)。修:渲染已完成且 note 未变时 show
  // 幂等跳过(只重放位置);more 行移出滚动容器,长内容常显快捷键提示。
  test('同 note 重复 show:不重渲染(无 hidden 间歇)、内容不清空——幂等', async () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    tip.show('同文', 100, 100)
    await vi.waitFor(() => expect(el.textContent).toContain('同文'))
    expect(el.style.visibility).toBe('visible')
    const calls = mocked.mock.calls.length
    tip.show('同文', 120, 120) // 角标内子元素切换触发的重复 show
    expect(mocked.mock.calls.length).toBe(calls) // 不再调 renderVditorPreview
    expect(el.style.visibility).toBe('visible') // 无 hidden 间歇(不闪)
    expect(el.textContent).toContain('同文') // 内容未被清空
    tip.destroy()
  })

  test('不同 note 的 show 照常全量重渲染(切节点换内容不受幂等影响)', async () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    tip.show('甲文', 100, 100)
    await vi.waitFor(() => expect(el.textContent).toContain('甲文'))
    tip.show('乙文', 100, 100)
    await vi.waitFor(() => expect(el.textContent).toContain('乙文'))
    expect(mocked).toHaveBeenLastCalledWith(expect.any(HTMLElement), '乙文', 'light')
    tip.destroy()
  })

  test('more 行常显:在滚动容器外(外壳 flex 列,内容区独立滚动)', async () => {
    const tip = createNoteTooltip('light')
    const el = document.querySelector<HTMLElement>('.zen-note-tip')!
    tip.show('长文', 100, 100)
    await vi.waitFor(() => expect(el.querySelector('.zen-note-tip-more')).toBeTruthy())
    const body = el.querySelector<HTMLElement>('.zen-note-tip-body')!
    // 滚动属性落内容区(长内容滚内容区,more 行钉底不参与滚动);外壳 40vh 封顶
    expect(body.style.overflowY).toBe('auto')
    expect(body.style.minHeight).toBe('0px')
    // more 是外壳直接子元素,与内容区平级
    expect(el.querySelector('.zen-note-tip-body + .zen-note-tip-more')).toBeTruthy()
    tip.destroy()
  })
})
