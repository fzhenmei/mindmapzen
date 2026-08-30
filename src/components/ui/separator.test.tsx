import { render } from '@testing-library/react'
import { Separator } from './separator'

// Separator（官方源码重置）：role 语义由 Radix 按 decorative 切换，定位经 data-slot。

test('默认装饰性分隔线：role=none（不进无障碍树）、官方 border 色', () => {
  const { container } = render(<Separator />)
  const sep = container.querySelector('[data-slot="separator"]')!
  expect(sep).toHaveAttribute('role', 'none')
  expect(sep.className).toContain('bg-border')
  expect(sep.className).toContain('data-[orientation=horizontal]:h-px')
})

test('语义分隔线（decorative=false）：role=separator + 垂直方向语义与工具类', () => {
  const { container } = render(<Separator decorative={false} orientation="vertical" />)
  const sep = container.querySelector('[data-slot="separator"]')!
  expect(sep).toHaveAttribute('role', 'separator')
  expect(sep).toHaveAttribute('aria-orientation', 'vertical')
  expect(sep.className).toContain('data-[orientation=vertical]:w-px')
})
