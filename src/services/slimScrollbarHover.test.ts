import { afterEach, expect, test } from 'vitest'
import { enableSlimScrollbarHover } from './slimScrollbarHover'

// 守卫幂等（模块级 installed），装一次后续用例共用同一监听
enableSlimScrollbarHover()

/** 造一段 DOM：outer(可滚) > mid(可滚) > btn；outside(不可滚) 平级挂在 body 上 */
function fixture(): { btn: HTMLElement; mid: HTMLElement; outer: HTMLElement; outside: HTMLElement } {
  const outer = document.createElement('div')
  outer.style.overflowY = 'auto'
  const mid = document.createElement('div')
  mid.style.overflowX = 'scroll'
  const btn = document.createElement('button')
  const outside = document.createElement('div')
  mid.appendChild(btn)
  outer.appendChild(mid)
  document.body.append(outer, outside)
  return { btn, mid, outer, outside }
}

/** 派发指针事件（jsdom 以 MouseEvent 承载 pointerover/out 类型即可） */
const fire = (type: 'pointerover' | 'pointerout', el: Element, relatedTarget: EventTarget | null = null): void => {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }))
}

afterEach(() => { document.body.replaceChildren() })

test('指针进入可滚容器子元素：可滚祖先链全挂 .sb-hot（委托 + 爬链）', () => {
  const { btn, mid, outer } = fixture()
  fire('pointerover', btn)
  expect(outer.classList.contains('sb-hot')).toBe(true)
  expect(mid.classList.contains('sb-hot')).toBe(true)
})

test('指针移到容器外：.sb-hot 摘除', () => {
  const { btn, mid, outside } = fixture()
  fire('pointerover', btn)
  fire('pointerover', outside)
  expect(mid.classList.contains('sb-hot')).toBe(false)
})

test('指针离窗（pointerout 无 relatedTarget）：悬停态清空', () => {
  const { btn, outer } = fixture()
  fire('pointerover', btn)
  fire('pointerout', btn, null)
  expect(outer.classList.contains('sb-hot')).toBe(false)
})

test('容器内指针跨越子元素：悬停态保持不闪烁', () => {
  const { btn, mid } = fixture()
  fire('pointerover', btn)
  fire('pointerover', mid)
  expect(mid.classList.contains('sb-hot')).toBe(true)
})
