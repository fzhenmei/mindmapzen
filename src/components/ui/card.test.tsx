import { render, screen } from '@testing-library/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'

// Card（M14 Task 2 新增，官方源码）：卡片解剖件 + 官方布局类（gap-6/px-6/rounded-xl）。

test('卡片解剖：各件渲染且带官方 data-slot 与类', () => {
  render(
    <Card data-testid="card">
      <CardHeader>
        <CardTitle>图名</CardTitle>
        <CardDescription>修改时间</CardDescription>
      </CardHeader>
      <CardContent>内容</CardContent>
      <CardFooter>页脚</CardFooter>
    </Card>,
  )
  const card = screen.getByTestId('card')
  expect(card.className).toContain('rounded-xl')
  expect(card.className).toContain('bg-card')
  expect(card.className).toContain('text-card-foreground')
  expect(card.className).toContain('gap-6')
  expect(screen.getByText('图名').className).toContain('font-semibold')
  expect(screen.getByText('修改时间').className).toContain('text-muted-foreground')
  expect(screen.getByText('内容').className).toContain('px-6')
  expect(screen.getByText('页脚').className).toContain('flex')
})
