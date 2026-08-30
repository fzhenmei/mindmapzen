import { fireEvent, render, screen } from '@testing-library/react'
import { Toggle, toggleVariants } from './toggle'

// Toggle（toggle-group 的官方依赖件）：独立开关钮 + 官方 variant。

test('点击切换 data-state，选中走官方 accent 类', () => {
  render(<Toggle>布局</Toggle>)
  const btn = screen.getByRole('button', { name: '布局' })
  expect(btn.className).toContain('hover:bg-muted')
  expect(btn).toHaveAttribute('data-state', 'off')
  fireEvent.click(btn)
  expect(btn).toHaveAttribute('data-state', 'on')
  expect(btn.className).toContain('data-[state=on]:bg-accent')
})

test('outline variant 官方类 + toggleVariants cva 导出', () => {
  render(<Toggle variant="outline">布局</Toggle>)
  expect(screen.getByRole('button').className).toContain('border')
  expect(toggleVariants({ size: 'sm' })).toContain('h-8')
})
