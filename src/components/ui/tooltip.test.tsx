import { fireEvent, render, screen } from '@testing-library/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

// jsdom 驱动沿用 ZenTooltip.test 模式：pointerMove 派发 + waitFor 等延迟到期。
// 官方 Tooltip（Root）不自持 Provider——独立可用，Provider 只调延迟（官方语义）。

test('未悬停不渲染浮签', () => {
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>钮</TooltipTrigger>
        <TooltipContent>保存（Ctrl+S）</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  )
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

test('悬停后浮签经 Portal 显示：官方倒置配色 + 箭头 + 动效类', async () => {
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>钮</TooltipTrigger>
        <TooltipContent>保存（Ctrl+S）</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  )
  fireEvent.pointerMove(screen.getByRole('button', { name: '钮' }), { pointerType: 'mouse' })
  const tip = await screen.findByRole('tooltip')
  expect(tip).toHaveTextContent('保存（Ctrl+S）')
  expect(tip).toHaveAttribute('data-slot', 'tooltip-content')
  expect(tip.className).toContain('bg-foreground')
  expect(tip.className).toContain('text-background')
  expect(tip.className).toContain('px-3')
  expect(tip.className).toContain('py-1.5')
  expect(tip.className).toContain('animate-in')
  // 官方自带旋转箭头（rotate-45 方块）
  expect(tip.querySelector('svg')).not.toBeNull()
})

test('TooltipProvider 独立导出并可调延迟（官方组合面）', () => {
  render(
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>钮</TooltipTrigger>
        <TooltipContent>提示</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  )
  expect(screen.getByRole('button', { name: '钮' })).toBeInTheDocument()
})
