import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import ToastHost from './ToastHost'
import { showToast } from '../services/toast'

afterEach(() => {
  showToast('') // 清残留（覆盖式单条）
  vi.useRealTimers()
})

test('showToast 渲染文案；带动作按钮可点击', async () => {
  render(<ToastHost />)
  const run = vi.fn()
  act(() => {
    showToast('已入篮', { label: '打开篮子', run })
  })
  expect(await screen.findByTestId('toast')).toHaveTextContent('已入篮')
  await userEvent.click(screen.getByTestId('toast-action'))
  expect(run).toHaveBeenCalledTimes(1)
})

test('约 2s 后自动消失', async () => {
  vi.useFakeTimers()
  render(<ToastHost />)
  act(() => {
    showToast('一闪')
  })
  expect(screen.getByTestId('toast')).toBeInTheDocument()
  act(() => {
    vi.advanceTimersByTime(2100)
  })
  expect(screen.queryByTestId('toast')).toBeNull()
})

