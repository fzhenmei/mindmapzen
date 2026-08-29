import { render, screen } from '@testing-library/react'
import { Separator } from './separator'

test('默认装饰性分隔线：role=none（不进无障碍树）、青松 border 色', () => {
  render(<Separator />)
  const sep = screen.getByTestId('ui-separator')
  expect(sep).toHaveAttribute('role', 'none')
  expect(sep.className).toContain('bg-border')
  expect(sep.className).toContain('data-[orientation=horizontal]:h-px')
})

test('语义分隔线（decorative=false）：role=separator + 垂直方向语义与工具类', () => {
  render(<Separator decorative={false} orientation="vertical" />)
  const sep = screen.getByTestId('ui-separator')
  expect(sep).toHaveAttribute('role', 'separator')
  expect(sep).toHaveAttribute('aria-orientation', 'vertical')
  expect(sep.className).toContain('data-[orientation=vertical]:w-px')
})
