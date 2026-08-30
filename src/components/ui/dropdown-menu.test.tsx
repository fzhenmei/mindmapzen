import { fireEvent, render, screen } from '@testing-library/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

// jsdom 驱动沿用 ZenDialog.test 模式：直接派发 Radix Trigger 监听的 pointerdown（button 0）

test('Trigger pointerdown 打开菜单，条目经 Portal 渲染且为青松皮肤', () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>文件</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>新建导图</DropdownMenuItem>
        <DropdownMenuItem>打开目录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  expect(screen.queryByTestId('ui-dropdown-content')).not.toBeInTheDocument()
  fireEvent.pointerDown(screen.getByRole('button', { name: '文件' }), { button: 0 })
  const content = screen.getByTestId('ui-dropdown-content')
  expect(content.className).toContain('bg-card')
  expect(content.className).toContain('rounded-lg')
  expect(screen.getByText('新建导图')).toBeInTheDocument()
})

test('点击条目触发 onSelect 并关闭菜单', () => {
  const onSelect = vi.fn()
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>文件</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelect}>新建导图</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: '文件' }), { button: 0 })
  fireEvent.click(screen.getByText('新建导图'))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('ui-dropdown-content')).not.toBeInTheDocument()
})
