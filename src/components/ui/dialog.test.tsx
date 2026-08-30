import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from './dialog'

// jsdom 驱动沿用 ZenDialog.test 模式：内容经 Portal 渲染进 document.body，
// Esc 走 Radix 对 Content 的捕获监听（fireEvent.keyDown 派发）

test('受控打开：Content/Title/Description 经 Portal 渲染，皮肤为青松令牌类', () => {
  render(
    <Dialog open onOpenChange={() => {}}>
      <DialogContent>
        <DialogTitle>导出确认</DialogTitle>
        <DialogDescription>将导出为 Markdown 文件</DialogDescription>
        <DialogFooter>
          <DialogClose>取消</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  )
  const content = screen.getByTestId('ui-dialog-content')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('导出确认')).toHaveProperty('tagName', 'H2')
  expect(screen.getByTestId('ui-dialog-title').id).toBe(content.getAttribute('aria-labelledby'))
  expect(content.className).toContain('bg-surface')
  expect(content.className).toContain('rounded-card')
  expect(content.className).toContain('shadow-overlay')
})

test('Trigger 点击打开；Esc 关闭（onOpenChange false）', () => {
  const onOpenChange = vi.fn()
  render(
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger>打开</DialogTrigger>
      <DialogContent>
        <DialogTitle>标题</DialogTitle>
      </DialogContent>
    </Dialog>,
  )
  fireEvent.click(screen.getByRole('button', { name: '打开' }))
  expect(screen.getByTestId('ui-dialog-content')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByTestId('ui-dialog-content'), { key: 'Escape' })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('DialogClose 点击触发关闭（受控 state 流转整环）', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger>开</DialogTrigger>
        <DialogContent>
          <DialogTitle>题</DialogTitle>
          <DialogClose>取消</DialogClose>
        </DialogContent>
      </Dialog>
    )
  }
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '开' }))
  expect(screen.getByTestId('ui-dialog-content')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByTestId('ui-dialog-content')).not.toBeInTheDocument()
})

// 迁移自 ZenDialog.test（M12b Task 5 旧组件删除）：取消权出口的等价断言——
// Content 内建 ✕ 与遮罩外点击均经 onOpenChange(false) 交还调用方（消费方 onClose 同义）。
describe('取消权出口（自 ZenDialog.test 迁移）', () => {
  test('内建 ✕ 按钮触发 onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>标题</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    fireEvent.click(screen.getByTestId('ui-dialog-close'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('遮罩外点击触发 onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>标题</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    // Radix 的 pointerdown-outside 监听经 setTimeout(0) 注册：让出一个宏任务再派发；
    // 且左键外点击判定延迟到后续 click（deferPointerDownOutside），需补 click 手势
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
