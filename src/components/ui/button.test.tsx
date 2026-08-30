import { fireEvent, render, screen } from '@testing-library/react'
import { Button, buttonVariants } from './button'

// Button（M14 Task 2 官方源码重置）：variant/size 官方类逐字 + data-variant/data-size
// 语义钩子 + Slot asChild + cva 导出（shadcn 约定）。断言只对官方类名/行为，不测内部 px。

test('default variant：官方主色实底 + data-variant/data-size 语义钩子', () => {
  render(<Button>保存</Button>)
  const btn = screen.getByRole('button', { name: '保存' })
  expect(btn).toHaveAccessibleName('保存')
  expect(btn.className).toContain('bg-primary')
  expect(btn.className).toContain('text-primary-foreground')
  expect(btn.className).toContain('hover:bg-primary/90')
  expect(btn.className).toContain('rounded-md')
  expect(btn).toHaveAttribute('data-slot', 'button')
  expect(btn).toHaveAttribute('data-variant', 'default')
  expect(btn).toHaveAttribute('data-size', 'default')
})

test('六 variant 各自渲染官方类', () => {
  const { rerender } = render(<Button variant="secondary">钮</Button>)
  expect(screen.getByRole('button').className).toContain('bg-secondary')
  rerender(<Button variant="ghost">钮</Button>)
  expect(screen.getByRole('button').className).toContain('hover:bg-accent')
  rerender(<Button variant="destructive">钮</Button>)
  expect(screen.getByRole('button').className).toContain('bg-destructive')
  rerender(<Button variant="outline">钮</Button>)
  expect(screen.getByRole('button').className).toContain('shadow-xs')
  rerender(<Button variant="link">钮</Button>)
  expect(screen.getByRole('button').className).toContain('underline-offset-4')
})

test('size 官方档位渲染（default h-9 / sm h-8 / lg h-10 / icon size-9）', () => {
  const { rerender } = render(<Button size="default">钮</Button>)
  expect(screen.getByRole('button').className).toContain('h-9')
  rerender(<Button size="sm">钮</Button>)
  expect(screen.getByRole('button').className).toContain('h-8')
  rerender(<Button size="lg">钮</Button>)
  expect(screen.getByRole('button').className).toContain('h-10')
  rerender(<Button size="icon">钮</Button>)
  expect(screen.getByRole('button').className).toContain('size-9')
})

test('asChild 经 Radix Slot 把官方皮肤并到子元素', () => {
  render(
    <Button asChild>
      <a href="#x">链接钮</a>
    </Button>,
  )
  const link = screen.getByRole('link', { name: '链接钮' })
  expect(link.className).toContain('bg-primary')
  expect(link).toHaveAttribute('data-slot', 'button')
})

test('点击事件透传；调用方 className 冲突类覆盖内置默认（tailwind-merge）', () => {
  const onClick = vi.fn()
  render(
    <Button className="px-6" onClick={onClick}>
      钮
    </Button>,
  )
  const btn = screen.getByRole('button')
  expect(btn.className).toContain('px-6')
  expect(btn.className).not.toContain('px-4')
  fireEvent.click(btn)
  expect(onClick).toHaveBeenCalledTimes(1)
})

test('disabled 停点透传原生属性', () => {
  render(<Button disabled>钮</Button>)
  expect(screen.getByRole('button')).toBeDisabled()
})

test('buttonVariants cva 导出可独立取类（shadcn 消费方约定）', () => {
  expect(buttonVariants({ variant: 'outline', size: 'sm' })).toContain('h-8')
})
