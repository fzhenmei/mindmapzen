import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from './button'

// Button：shadcn 约定（variant/size props + className 冲突消解），皮肤纯青松令牌工具类

test('default variant：主色实底 + 青松字 + 焦点环 + testid ui-button', () => {
  render(<Button>保存</Button>)
  const btn = screen.getByTestId('ui-button')
  expect(btn).toHaveRole('button')
  expect(btn).toHaveAccessibleName('保存')
  expect(btn.className).toContain('bg-primary')
  expect(btn.className).toContain('text-primary-soft')
  expect(btn.className).toContain('rounded-control')
  expect(btn.className).toContain('focus-visible:ring-ring')
})

test('四 variant 各自渲染对应令牌皮肤', () => {
  const { rerender } = render(<Button variant="secondary">钮</Button>)
  expect(screen.getByTestId('ui-button').className).toContain('bg-surface')
  rerender(
    <Button variant="ghost" data-testid="ui-button">
      钮
    </Button>,
  )
  expect(screen.getByTestId('ui-button').className).toContain('hover:bg-primary-soft')
  rerender(
    <Button variant="destructive" data-testid="ui-button">
      钮
    </Button>,
  )
  expect(screen.getByTestId('ui-button').className).toContain('bg-brand')
})

test('三 size 各自渲染（default h-8 / sm h-7 / icon size-8）', () => {
  const { rerender } = render(<Button size="sm">钮</Button>)
  expect(screen.getByTestId('ui-button').className).toContain('h-7')
  rerender(
    <Button size="icon" data-testid="ui-button">
      钮
    </Button>,
  )
  expect(screen.getByTestId('ui-button').className).toContain('size-8')
})

test('点击事件透传；调用方 className 冲突类覆盖内置默认（tailwind-merge）', () => {
  const onClick = vi.fn()
  render(
    <Button className="px-6" onClick={onClick}>
      钮
    </Button>,
  )
  const btn = screen.getByTestId('ui-button')
  expect(btn.className).toContain('px-6')
  expect(btn.className).not.toContain('px-4')
  fireEvent.click(btn)
  expect(onClick).toHaveBeenCalledTimes(1)
})

test('disabled 停点透传原生属性', () => {
  render(<Button disabled>钮</Button>)
  expect(screen.getByTestId('ui-button')).toBeDisabled()
})
