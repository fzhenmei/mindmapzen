// useEditorHotkeys 守卫测试（2026-09 AI 面板选段复制）：裸 Ctrl+C 三分支——
// 无选区截获走 doCopy（现状）/ 非折叠文本选区放行原生复制（本次新增）/ 输入域焦点放行（现状回归）。
// 文本选区是浏览器全局状态，vi.spyOn 桩 getSelection（jsdom 布局无关，真实选区不可造）
import { fireEvent, renderHook } from '@testing-library/react'
import { vi, test, expect, afterEach } from 'vitest'
import { useEditorHotkeys } from './useEditorHotkeys'

/** 装配被测 hook：全端口 vi.fn() 桩 + anyDialogRef 直改闭包对象（RefObject 结构等价） */
function setup(): ReturnType<typeof makeFns> {
  const fns = makeFns()
  renderHook(() => useEditorHotkeys({ ...fns, anyDialogRef: { current: false } }))
  return fns
}

function makeFns() {
  return {
    doCopy: vi.fn(),
    explicitSave: vi.fn(),
    toggleBodyDialog: vi.fn(),
    openQuickSwitch: vi.fn(),
    openNodeSearch: vi.fn(),
    cycleStep: vi.fn(),
    switchViewMode: vi.fn(),
    goBack: vi.fn(),
  }
}

/** 派发裸 Ctrl+C 到指定目标（默认 window），返回事件供 defaultPrevented 断言 */
function pressCtrlC(target: Window | Element = window): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true })
  fireEvent(target, e)
  return e
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('非折叠文本选区：Ctrl+C 放行原生复制（不调 doCopy、不 preventDefault）', () => {
  const fns = setup()
  vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, toString: () => '选中片段' } as unknown as Selection)
  const e = pressCtrlC()
  expect(fns.doCopy).not.toHaveBeenCalled()
  expect(e.defaultPrevented).toBe(false)
})

test('折叠选区不算（含纯图片选区 toString 为空）：仍截获走 doCopy', () => {
  const fns = setup()
  vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, toString: () => '' } as unknown as Selection)
  const e = pressCtrlC()
  expect(fns.doCopy).toHaveBeenCalledTimes(1)
  expect(e.defaultPrevented).toBe(true)
})

test('无选区（jsdom 默认折叠）：Ctrl+C 截获走 doCopy 整图 md（现状）', () => {
  const fns = setup()
  const e = pressCtrlC()
  expect(fns.doCopy).toHaveBeenCalledTimes(1)
  expect(e.defaultPrevented).toBe(true)
})

test('焦点在输入域（AI 输入框/正文等）：放行原生复制（现状回归）', () => {
  const fns = setup()
  const ta = document.createElement('textarea')
  document.body.appendChild(ta)
  ta.focus()
  try {
    const e = pressCtrlC(ta)
    expect(fns.doCopy).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  } finally {
    ta.remove()
  }
})
