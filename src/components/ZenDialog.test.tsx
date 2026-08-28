import { fireEvent, render, screen } from '@testing-library/react'
import ZenDialog from './ZenDialog'

test('渲染标题与内容，Esc 触发 onClose', () => {
  const onClose = vi.fn()
  render(
    <ZenDialog title="确认" onClose={onClose} actions={<button type="button">好</button>}>
      正文
    </ZenDialog>,
  )
  expect(screen.getByText('确认')).toBeInTheDocument()
  expect(screen.getByText('正文')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '好' })).toBeInTheDocument()
  fireEvent.keyDown(document.querySelector('.zen-dialog')!, { key: 'Escape' })
  // cancel 事件由浏览器在 Esc 时派发；jsdom 不派发则直接派发 cancel 验证路径
  document.querySelector('.zen-dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
  expect(onClose).toHaveBeenCalled()
})
