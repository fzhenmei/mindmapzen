import { fireEvent, render, screen } from '@testing-library/react'
import ConflictDialog from './ConflictDialog'

// 冲突裁决三态对话框：磁盘内容已被外部（多实例/其他编辑器）改写时的保存前拦截
test('三态对话框展示导图名，三键各自回调', () => {
  const onChoice = vi.fn()
  render(<ConflictDialog mapName="想法" onChoice={onChoice} />)
  expect(screen.getByTestId('conflict-dialog')).toHaveAttribute('aria-label', '「想法」已在其他窗口或程序中被修改')
  expect(screen.getByText(/「想法」已在其他窗口或程序中被修改/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('conflict-reload'))
  expect(onChoice).toHaveBeenCalledWith('reload')
  fireEvent.click(screen.getByTestId('conflict-overwrite'))
  expect(onChoice).toHaveBeenCalledWith('overwrite')
  fireEvent.click(screen.getByTestId('conflict-cancel'))
  expect(onChoice).toHaveBeenCalledWith('cancel')
  expect(onChoice).toHaveBeenCalledTimes(3)
})
