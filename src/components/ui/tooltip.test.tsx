import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

// jsdom 驱动沿用 ZenTooltip.test 模式：pointerMove 派发 + waitFor 等延迟到期

test('未悬停不渲染浮签', () => {
  render(
    <Tooltip>
      <TooltipTrigger>钮</TooltipTrigger>
      <TooltipContent>保存（Ctrl+S）</TooltipContent>
    </Tooltip>,
  )
  expect(screen.queryByTestId('ui-tooltip-content')).not.toBeInTheDocument()
})

test('悬停后浮签经 Portal 显示，皮肤为青松令牌类', async () => {
  render(
    <Tooltip>
      <TooltipTrigger>钮</TooltipTrigger>
      <TooltipContent>保存（Ctrl+S）</TooltipContent>
    </Tooltip>,
  )
  fireEvent.pointerMove(screen.getByRole('button', { name: '钮' }), { pointerType: 'mouse' })
  const tip = await waitFor(() => screen.getByTestId('ui-tooltip-content'))
  expect(tip).toHaveTextContent('保存（Ctrl+S）')
  expect(tip.className).toContain('bg-card')
  expect(tip.className).toContain('rounded-md')
})
