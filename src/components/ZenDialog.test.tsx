import { fireEvent, render, screen } from '@testing-library/react'
import ZenDialog from './ZenDialog'

// ZenDialog 基于 Radix Dialog 原语：内容经 Portal 渲染进 document.body（screen 仍可查），
// Esc 走 Radix 对 document 的捕获监听（原"派发原生 cancel 事件"路径随 <dialog> 退役）

test('渲染标题与内容（Radix Portal 内），Esc 触发 onClose', () => {
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
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('取消权出口：✕ 按钮与遮罩外点击均触发 onClose', async () => {
  const onClose = vi.fn()
  render(
    <ZenDialog title="确认" onClose={onClose}>
      正文
    </ZenDialog>,
  )
  fireEvent.click(screen.getByTestId('zen-dialog-close'))
  expect(onClose).toHaveBeenCalledTimes(1)
  // Radix 的 pointerdown-outside 监听经 setTimeout(0) 注册：让出一个宏任务再派发；
  // 且左键外点击判定延迟到后续 click（deferPointerDownOutside），需补 click 手势
  await new Promise((r) => setTimeout(r, 0))
  fireEvent.pointerDown(document.body)
  fireEvent.click(document.body)
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('dismissable=false：无 ✕ 出口，Esc 与外点击均被拦截', async () => {
  const onClose = vi.fn()
  render(
    <ZenDialog title="强制" dismissable={false} onClose={onClose}>
      正文
    </ZenDialog>,
  )
  expect(screen.queryByTestId('zen-dialog-close')).not.toBeInTheDocument()
  fireEvent.keyDown(document.querySelector('.zen-dialog')!, { key: 'Escape' })
  await new Promise((r) => setTimeout(r, 0))
  fireEvent.pointerDown(document.body)
  fireEvent.click(document.body)
  expect(onClose).not.toHaveBeenCalled()
})
