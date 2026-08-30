import { fireEvent, render, screen } from '@testing-library/react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './sidebar'

// sidebar 块（M14 Task 2 新增，官方源码）：Provider 含折叠/cookie/键盘(Ctrl+B)全内置；
// jsdom 桌面路径（setup.ts 的 matchMedia 桩 matches:false + innerWidth 1024）。

function Desk() {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>印标</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>目录</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive>项目</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>文件</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
      </SidebarInset>
    </SidebarProvider>
  )
}

test('骨架渲染：wrapper/容器/Inset + MenuButton isActive → data-active', () => {
  render(<Desk />)
  expect(document.querySelector('[data-slot="sidebar-wrapper"]')).not.toBeNull()
  const sidebar = document.querySelector('[data-slot="sidebar"]')!
  expect(sidebar.getAttribute('data-state')).toBe('expanded')
  expect(document.querySelector('[data-slot="sidebar-container"]')!.className).toContain('fixed')
  const active = screen.getByRole('button', { name: '项目' })
  expect(active).toHaveAttribute('data-active', 'true')
  expect(active.className).toContain('data-[active=true]:bg-sidebar-accent')
  expect(screen.getByRole('button', { name: '文件' })).toHaveAttribute('data-active', 'false')
  expect(document.querySelector('[data-slot="sidebar-inset"]')).not.toBeNull()
})

test('SidebarTrigger 折叠：state 翻转 + cookie 落盘（官方折叠记忆）', () => {
  document.cookie = 'sidebar_state=; path=/; max-age=0'
  render(<Desk />)
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
  const sidebar = document.querySelector('[data-slot="sidebar"]')!
  expect(sidebar.getAttribute('data-state')).toBe('collapsed')
  expect(document.cookie).toContain('sidebar_state=false')
  fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
  expect(sidebar.getAttribute('data-state')).toBe('expanded')
  expect(document.cookie).toContain('sidebar_state=true')
})

test('Ctrl+B 键盘快捷键切换折叠（官方内置）', () => {
  render(<Desk />)
  fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
  expect(document.querySelector('[data-slot="sidebar"]')!.getAttribute('data-state')).toBe('collapsed')
})

test('useSidebar 脱离 Provider 抛错（官方守卫）', () => {
  function Orphan() {
    useSidebar()
    return null
  }
  // React 19 错误边界外直接抛——用静默 console 断言异常即可
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => render(<Orphan />)).toThrow(/SidebarProvider/)
  spy.mockRestore()
})
