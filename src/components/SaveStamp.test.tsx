import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SaveStamp from './SaveStamp'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('saved：渲染「已存」朱砂印，1.2s 后自动消失', () => {
  const { unmount } = render(<SaveStamp kind="saved" />)
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已存')
  expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-seal')
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
  unmount() // 卸载清理定时器（不泄漏、不报错）
})

test('copied：渲染「已复制」墨青印，1.2s 后自动消失', () => {
  render(<SaveStamp kind="copied" />)
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制')
  expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-ink')
  act(() => {
    vi.advanceTimersByTime(1300)
  })
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
})
