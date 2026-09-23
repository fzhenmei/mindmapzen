import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createImgTooltip } from './imgTooltip'
import { HIDE_GRACE_MS } from './noteTooltip'

// 插图浮层改造(2026-09-23):①视口钳制——原实现按 480×320 估算翻转,真图尺寸外的
// 情形无钳制,节点靠边时浮层被截断;改锚点(鼠标坐标)翻转 + clampOverlayPos 钳制,
// 尺寸取图片 load 后实测。②指针判留——原 hide 立即藏,鼠标移不进浮层;照 noteTooltip
// 的防抖方案(HIDE_GRACE_MS + 指针 rect 判留 + 浮层 mouseleave 管理 + Esc 立即关)。
// jsdom 无布局(offsetWidth 恒 0)且图片永不加载:own-property 桩注入尺寸,手动
// dispatch load/error 事件驱动异步加载路径(量测桩约定同 noteTooltip.test.ts)。

const getEl = (): HTMLElement => document.querySelector<HTMLElement>('[data-testid="zen-img-tip"]')!
const getImg = (): HTMLImageElement => getEl().querySelector<HTMLImageElement>('img')!
/** 桩注入浮层实测尺寸(load 后放置量测用) */
const stubSize = (w: number, h: number): void => {
  const el = getEl()
  Object.defineProperty(el, 'offsetWidth', { value: w, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: h, configurable: true })
}
/** 驱动图片加载完成(jsdom 不发资源请求,load 监听须手动触发) */
const loadImg = (): void => {
  getImg().dispatchEvent(new Event('load'))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.querySelectorAll('[data-testid="zen-img-tip"]').forEach((el) => el.remove())
})

describe('imgTooltip:视口钳制(2026-09-23 边缘截断修复)', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('innerHeight', 768)
  })

  test('右/下缘放不下时翻到指针左/上侧(实测尺寸判翻转,不再按 480×320 估算)', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 950, clientY: 600 })
    stubSize(300, 150)
    loadImg()
    // 左:950+12+300 > 1024-8 → 翻转 950-12-300=638;上:600+12+150 > 768-8 → 438
    expect(getEl().style.left).toBe('638px')
    expect(getEl().style.top).toBe('438px')
    tip.destroy()
  })

  test('界内默认指针右下展开(12px 错位防遮光标)', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 100, clientY: 100 })
    stubSize(300, 150)
    loadImg()
    expect(getEl().style.left).toBe('112px')
    expect(getEl().style.top).toBe('112px')
    tip.destroy()
  })

  test('窄视口翻转后仍溢出:钳到边距贴边(翻转的兜底)', () => {
    vi.stubGlobal('innerWidth', 500)
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 200, clientY: 600 })
    stubSize(300, 150)
    loadImg()
    // 200+12+300 > 500-8 翻转 → 200-12-300=-112,仍 < 8 → 钳到 8;上同主用例 438
    expect(getEl().style.left).toBe('8px')
    expect(getEl().style.top).toBe('438px')
    tip.destroy()
  })

  test('左/上缘负锚点抬到边距(不越过视口左上)', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: -20, clientY: -5 })
    stubSize(300, 150)
    loadImg()
    expect(getEl().style.left).toBe('8px')
    expect(getEl().style.top).toBe('8px')
    tip.destroy()
  })
})

describe('imgTooltip:两段式显形 + 加载失败出口(尺寸异步才知道)', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('innerHeight', 768)
  })

  test('show 先藏(visibility)量测,load 完成放置后才显形——防先右后左闪现', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 100, clientY: 100 })
    expect(getEl().style.display).toBe('block')
    expect(getEl().style.visibility).toBe('hidden')
    expect(getImg().src).toContain('data:image/png;base64,x')
    stubSize(300, 150)
    loadImg()
    expect(getEl().style.visibility).toBe('visible')
    expect(getEl().style.left).toBe('112px')
    tip.destroy()
  })

  test('隐藏后迟到的 load 不得显形(seq 守卫:快速切换/关闭后旧图迟到覆盖)', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 100, clientY: 100 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(getEl().style.display).toBe('none')
    loadImg() // 关闭后才加载完:不得把已藏的浮层再显出来
    expect(getEl().style.display).toBe('none')
    expect(getEl().style.visibility).toBe('hidden')
    tip.destroy()
  })

  test('load 失败:console.error 显式出口 + 隐藏(禁止吞异常)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 100, clientY: 100 })
    getImg().dispatchEvent(new Event('error'))
    expect(errSpy).toHaveBeenCalled()
    expect(getEl().style.display).toBe('none')
    errSpy.mockRestore()
    tip.destroy()
  })
})

describe('imgTooltip:指针在浮层上不关闭(2026-09-23,同 noteTooltip 方案)', () => {
  // 引擎在图片元素 mouseleave 即调 hide,浮层挂 body 不在其子树——鼠标移向浮层途中
  // 必触发,立即藏则指针永远进不了浮层。hide 改 200ms 防抖:到点指针在浮层 rect 内
  // 则不藏(转入浮层 mouseleave 管理),grace 期间 show 打断。
  const GRACE = HIDE_GRACE_MS
  // jsdom 量测桩(getBoundingClientRect 恒 0):stub 出浮层 rect (100,50)-(500,250)
  const stubRect = (): void => {
    Object.defineProperty(getEl(), 'getBoundingClientRect', {
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

  test('hide 防抖到点指针在浮层内:不藏,可把鼠标放上去看图', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 300, clientY: 200 })
    stubRect()
    movePointer(300, 150) // 指针进浮层 rect
    tip.hide() // 引擎图片 mouseleave 到来
    vi.advanceTimersByTime(GRACE)
    expect(getEl().style.display).toBe('block') // 不藏
    tip.destroy()
  })

  test('指针不在浮层内:hide 防抖到点真藏(移开即关,略带 200ms 迟滞)', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 300, clientY: 200 })
    stubRect()
    movePointer(700, 400) // 界外
    tip.hide()
    expect(getEl().style.display).toBe('block') // 防抖期内未藏
    vi.advanceTimersByTime(GRACE)
    expect(getEl().style.display).toBe('none')
    tip.destroy()
  })

  test('浮层 mouseleave 后防抖到点藏;grace 期间 show 打断不藏', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 300, clientY: 200 })
    stubRect()
    // 在浮层内 hide → 不藏;随后指针离场触发浮层 mouseleave → 防抖到点藏
    movePointer(300, 150)
    tip.hide()
    vi.advanceTimersByTime(GRACE)
    movePointer(700, 400)
    getEl().dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(GRACE - 1)
    expect(getEl().style.display).toBe('block')
    vi.advanceTimersByTime(1)
    expect(getEl().style.display).toBe('none')
    // grace 期间 show 打断:hover 切换图片不闪藏
    tip.show('data:image/png;base64,y', { clientX: 300, clientY: 200 })
    movePointer(700, 400)
    tip.hide()
    vi.advanceTimersByTime(GRACE - 50)
    tip.show('data:image/png;base64,z', { clientX: 300, clientY: 200 }) // 打断 pending 隐藏
    vi.advanceTimersByTime(GRACE)
    expect(getEl().style.display).toBe('block')
    tip.destroy()
  })

  test('Esc 立即藏(无防抖);目标为输入元素时不拦截(留给节点编辑框)', () => {
    const tip = createImgTooltip()
    tip.show('data:image/png;base64,x', { clientX: 300, clientY: 200 })
    stubRect()
    movePointer(300, 150) // 指针在浮层内(防抖不会关)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(getEl().style.display).toBe('none') // Esc 无条件立即藏
    // 输入元素上的 Esc 不拦截
    tip.show('data:image/png;base64,x', { clientX: 300, clientY: 200 })
    const ta = document.createElement('textarea')
    document.body.append(ta)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(getEl().style.display).toBe('block')
    ta.remove()
    tip.destroy()
  })
})
