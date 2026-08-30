import { render, screen } from '@testing-library/react'
import { Badge, badgeVariants } from './badge'

// Badge（M14 Task 2 新增，官方源码）：胶囊徽章 + 官方 variant 面。

test('默认 variant：主色胶囊 + data-variant 钩子', () => {
  render(<Badge>.md</Badge>)
  const badge = screen.getByText('.md')
  expect(badge.className).toContain('bg-primary')
  expect(badge.className).toContain('text-primary-foreground')
  expect(badge.className).toContain('rounded-full')
  expect(badge).toHaveAttribute('data-variant', 'default')
})

test('secondary/outline/destructive variant 官方类', () => {
  const { rerender } = render(<Badge variant="secondary">.md</Badge>)
  expect(screen.getByText('.md').className).toContain('bg-secondary')
  rerender(<Badge variant="outline">.md</Badge>)
  expect(screen.getByText('.md').className).toContain('border-border')
  rerender(<Badge variant="destructive">.md</Badge>)
  expect(screen.getByText('.md').className).toContain('bg-destructive')
})

test('badgeVariants cva 导出可独立取类', () => {
  expect(badgeVariants({ variant: 'secondary' })).toContain('bg-secondary')
})
