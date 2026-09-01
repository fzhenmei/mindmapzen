import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import CopyStamp from './CopyStamp'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** 受控卸载脚手架：onDone 时移除印记（模拟 EditorView 的 setCopyStamp(null)） */
function Harness({ kind, pos }: Readonly<{ kind: 'copied-md' | 'copied-node'; pos: { left: number; top: number } }>) {
  const [show, setShow] = useState(true)
  return show ? <CopyStamp kind={kind} pos={pos} onDone={() => setShow(false)} /> : null
}

const pos = { left: 310, top: 87 }

test('copied-md：贴锚点渲染「已复制为 Markdown」墨青印，1.2s 到期经 onDone 卸载', () => {
  render(<Harness kind="copied-md" pos={pos} />)
  const el = screen.getByTestId('copy-stamp')
  expect(el).toHaveTextContent('已复制为 Markdown')
  expect(el).toHaveClass('stamp-ink')
  expect(el.style.left).toBe('310px') // 锚点随内联 style 落位（translate 居中在 .copy-stamp 类）
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(screen.queryByTestId('copy-stamp')).not.toBeInTheDocument()
})

test('copied-node：贴锚点渲染「已复制为节点」墨青印', () => {
  render(<Harness kind="copied-node" pos={pos} />)
  expect(screen.getByTestId('copy-stamp')).toHaveTextContent('已复制为节点')
  expect(screen.getByTestId('copy-stamp')).toHaveClass('stamp-ink')
})

test('显示期提前卸载：清理定时器，到期不再回调 onDone', () => {
  const onDone = vi.fn()
  const { unmount } = render(<CopyStamp kind="copied-node" pos={pos} onDone={onDone} />)
  act(() => {
    vi.advanceTimersByTime(600)
  })
  unmount()
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(onDone).not.toHaveBeenCalled()
})
