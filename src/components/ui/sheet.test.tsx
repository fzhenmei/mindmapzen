import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './sheet'

// Sheet（sidebar 块依赖件，官方源码）：Radix Dialog 承载的侧滑抽屉。

test('Trigger 打开：Content 经 Portal 渲染为 dialog + 标题/描述可达', () => {
  render(
    <Sheet>
      <SheetTrigger>抽屉</SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>侧栏</SheetTitle>
          <SheetDescription>移动端侧栏</SheetDescription>
        </SheetHeader>
        内容
      </SheetContent>
    </Sheet>,
  )
  fireEvent.click(screen.getByRole('button', { name: '抽屉' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog.className).toContain('bg-background')
  expect(screen.getByText('侧栏')).toHaveProperty('tagName', 'H2')
  expect(dialog).toHaveAttribute('aria-labelledby')
})

test('内建 Close（XIcon + sr-only Close）关闭（受控整环）', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger>抽屉</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>侧栏</SheetTitle>
            <SheetDescription>描述</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '抽屉' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
