import { fireEvent, render, screen } from '@testing-library/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'

// jsdom 驱动沿用 ZenDialog.test 模式：直接派发 Radix Trigger 监听的 pointerdown（button 0）。
// 定位用角色（menu/menuitem），皮肤断言对官方类（bg-popover 系）。

test('Trigger pointerdown 打开菜单，条目经 Portal 渲染且为官方弹层皮肤', () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>文件</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>新建导图</DropdownMenuItem>
        <DropdownMenuItem>打开目录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.pointerDown(screen.getByRole('button', { name: '文件' }), { button: 0 })
  const content = screen.getByRole('menu')
  expect(content).toHaveAttribute('data-slot', 'dropdown-menu-content')
  expect(content.className).toContain('bg-popover')
  expect(content.className).toContain('text-popover-foreground')
  expect(content.className).toContain('rounded-md')
  expect(screen.getByRole('menuitem', { name: '新建导图' })).toBeInTheDocument()
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
  fireEvent.click(screen.getByRole('menuitem', { name: '新建导图' }))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
