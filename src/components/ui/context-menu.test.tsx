import { fireEvent, render, screen } from '@testing-library/react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu'

// jsdom 驱动沿用 dropdown-menu.test 模式：ContextMenu Trigger 监听 contextmenu 事件，
// 定位用角色（menu/menuitem），皮肤断言对官方类（bg-popover 系）。

test('Trigger contextmenu 打开菜单，条目经 Portal 渲染且为官方弹层皮肤', () => {
  render(
    <ContextMenu>
      <ContextMenuTrigger>文件行</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>重命名</ContextMenuItem>
        <ContextMenuItem>删除</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>,
  )
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.contextMenu(screen.getByText('文件行'))
  const content = screen.getByRole('menu')
  expect(content).toHaveAttribute('data-slot', 'context-menu-content')
  expect(content.className).toContain('bg-popover')
  expect(content.className).toContain('text-popover-foreground')
  expect(content.className).toContain('rounded-md')
  expect(screen.getByRole('menuitem', { name: '重命名' })).toBeInTheDocument()
})

test('点击条目触发 onSelect 并关闭菜单', () => {
  const onSelect = vi.fn()
  render(
    <ContextMenu>
      <ContextMenuTrigger>文件行</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onSelect}>重命名</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>,
  )
  fireEvent.contextMenu(screen.getByText('文件行'))
  fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
