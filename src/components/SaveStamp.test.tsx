import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import SaveStamp from './SaveStamp'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** 受控卸载脚手架：onDone 时移除印记（模拟 EditorView 的 setStamp(null)） */
function Harness({ kind }: Readonly<{ kind: 'saved' | 'copied' }>) {
  const [show, setShow] = useState(true)
  return show ? <SaveStamp kind={kind} onDone={() => setShow(false)} /> : null
}

test('saved：渲染「已存」朱砂印，1.2s 到期经 onDone 卸载', () => {
  render(<Harness kind="saved" />)
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已存')
  expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-seal')
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
})

test('copied：渲染「已复制」墨青印，1.2s 到期经 onDone 卸载', () => {
  render(<Harness kind="copied" />)
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制')
  expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-ink')
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
})

test('显示期提前卸载：清理定时器，到期不再回调 onDone', () => {
  const onDone = vi.fn()
  const { unmount } = render(<SaveStamp kind="saved" onDone={onDone} />)
  act(() => {
    vi.advanceTimersByTime(600)
  })
  unmount() // 父组件在 1.2s 内换新 key 重挂载（或卸载视图）即走此路径
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(onDone).not.toHaveBeenCalled()
})

test('onDone 引用变化不重置 1.2s 计时（自挂载起算）', () => {
  // 父组件重渲染换内联回调是常态：若计时随之重置，印记会被持续续命永不消失
  const onDone = vi.fn()
  const { rerender } = render(<SaveStamp kind="saved" onDone={vi.fn()} />)
  act(() => {
    vi.advanceTimersByTime(1100)
  })
  rerender(<SaveStamp kind="saved" onDone={onDone} />) // RTL 自带 act：先冲刷 ref 更新
  act(() => {
    vi.advanceTimersByTime(200)
  })
  expect(onDone).toHaveBeenCalledTimes(1) // 按挂载时刻到期，回调取最新的那个
})
