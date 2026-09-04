import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import SplitResizer from './SplitResizer'

/** 手柄测试台：固定 256 起宽 / clamp [200, 520]，回调全桩 */
const harness = (props: Partial<Parameters<typeof SplitResizer>[0]> = {}) => {
  const cb = { onResize: vi.fn(), onCommit: vi.fn(), onReset: vi.fn() }
  render(<SplitResizer side="right" width={256} min={200} max={520} label="调整侧栏宽度" {...cb} {...props} />)
  return { handle: screen.getByRole('separator', { name: '调整侧栏宽度' }), ...cb }
}

/** 拖拽序列：down 于 x0 → move 至 xs 逐点 → up */
const drag = (el: Element, x0: number, xs: number[]) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: x0 })
  for (const x of xs) fireEvent.pointerMove(window, { pointerId: 1, clientX: x })
  fireEvent.pointerUp(window, { pointerId: 1 })
}

describe('SplitResizer（分区拖拽手柄）', () => {
  test('right 侧：clientX 右移增量即增宽，逐帧透传 onResize', () => {
    const { handle, onResize } = harness()
    drag(handle, 300, [340, 380])
    expect(onResize).toHaveBeenNthCalledWith(1, 296)
    expect(onResize).toHaveBeenNthCalledWith(2, 336)
  })

  test('left 侧：clientX 左移（减小）才增宽', () => {
    const { handle, onResize } = harness({ side: 'left' })
    drag(handle, 300, [260, 220])
    expect(onResize).toHaveBeenNthCalledWith(1, 296)
    expect(onResize).toHaveBeenNthCalledWith(2, 336)
  })

  test('越界 clamp 到 min/max', () => {
    const { handle, onResize } = harness()
    drag(handle, 300, [0])
    expect(onResize).toHaveBeenLastCalledWith(200)
    drag(handle, 300, [2000])
    expect(onResize).toHaveBeenLastCalledWith(520)
  })

  test('松手以最终宽提交 onCommit 一次；未移动的单击不提交', () => {
    const { handle, onCommit } = harness()
    drag(handle, 300, [340, 380])
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(336)
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 300 })
    fireEvent.pointerUp(window, { pointerId: 2 })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  test('双击触发 onReset（恢复默认宽）', () => {
    const { handle, onReset } = harness()
    fireEvent.dblClick(handle)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  test('拖拽期间 html 挂 data-split-resizing（禁过渡/锁选择），松手移除', () => {
    const { handle } = harness()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 300 })
    expect(document.documentElement.hasAttribute('data-split-resizing')).toBe(true)
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(document.documentElement.hasAttribute('data-split-resizing')).toBe(false)
  })

  test('非主键不进入拖拽', () => {
    const { handle, onResize } = harness()
    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 300 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400 })
    expect(onResize).not.toHaveBeenCalled()
  })
})
