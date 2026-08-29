import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ZenTooltip from './ZenTooltip'

// jsdom 驱动方式（与 ZenDialog.test 驱动 Radix Dialog 同思路：不经真浏览器手势，
// 直接派发 Radix Trigger 监听的指针事件）：Radix Tooltip 的 Trigger 在 pointermove
// （非 touch 指针）后经 delayDuration 计时打开——fireEvent.pointerMove 派发，
// 再用 waitFor 等延迟到期（组件配 delayDuration=300ms，真浏览器同路径）

test('未悬停不渲染浮签', () => {
  render(
    <ZenTooltip label="保存（Ctrl+S）">
      <button type="button" data-testid="trigger">
        钮
      </button>
    </ZenTooltip>,
  )
  expect(screen.queryByText('保存（Ctrl+S）')).not.toBeInTheDocument()
})

test('悬停触发器后浮签显示 label（Portal 内，.zen-tooltip 皮肤类）', async () => {
  render(
    <ZenTooltip label="保存（Ctrl+S）">
      <button type="button" data-testid="trigger">
        钮
      </button>
    </ZenTooltip>,
  )
  fireEvent.pointerMove(screen.getByTestId('trigger'), { pointerType: 'mouse' })
  const tip = await waitFor(() => screen.getByText('保存（Ctrl+S）'))
  expect(tip).toHaveClass('zen-tooltip')
})
