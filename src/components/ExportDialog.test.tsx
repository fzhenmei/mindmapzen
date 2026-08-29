import { fireEvent, render, screen } from '@testing-library/react'
import ExportDialog from './ExportDialog'
import type { ExportActions } from '../hooks/useExportFlow'

const actions: ExportActions = {
  onPng: vi.fn(),
  onSvg: vi.fn(),
  onCopy: vi.fn(),
  onClose: vi.fn(),
}

test('导出对话框四按钮：三入口各回调，取消出口仅收框不触发导出', () => {
  render(<ExportDialog actions={actions} />)
  // 取消权（想法4）：不选导出入口也能全身而退
  fireEvent.click(screen.getByTestId('export-cancel'))
  expect(actions.onClose).toHaveBeenCalledTimes(1)
  expect(actions.onPng).not.toHaveBeenCalled()
  expect(actions.onSvg).not.toHaveBeenCalled()
  expect(actions.onCopy).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('export-png'))
  fireEvent.click(screen.getByTestId('export-svg'))
  fireEvent.click(screen.getByTestId('export-copy'))
  expect(actions.onPng).toHaveBeenCalledTimes(1)
  expect(actions.onSvg).toHaveBeenCalledTimes(1)
  expect(actions.onCopy).toHaveBeenCalledTimes(1)
})
