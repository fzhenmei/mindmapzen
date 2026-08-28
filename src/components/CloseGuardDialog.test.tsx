import { fireEvent, render, screen } from '@testing-library/react'
import CloseGuardDialog from './CloseGuardDialog'

test('三态对话框展示导图名，三键各自回调', () => {
  const onChoice = vi.fn()
  render(<CloseGuardDialog mapName="想法" onChoice={onChoice} />)
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '关闭确认')
  expect(screen.getByText(/「想法」有未保存的修改/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('closeguard-save'))
  expect(onChoice).toHaveBeenCalledWith('save')
  fireEvent.click(screen.getByTestId('closeguard-discard'))
  expect(onChoice).toHaveBeenCalledWith('discard')
  fireEvent.click(screen.getByTestId('closeguard-cancel'))
  expect(onChoice).toHaveBeenCalledWith('cancel')
  expect(onChoice).toHaveBeenCalledTimes(3)
})
