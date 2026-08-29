import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

// jsdom 驱动沿用 ZenDialog.test 思路（不经真浏览器手势）：触发器经键盘打开
// （focus + ArrowDown）；条目高亮/选中必须在条目元素（role=option）上派发方向键——
// Radix Select 的 Content 处理器按 event.target 在条目数组中定位（源码行为，非 bug）

test('键盘打开后条目经 Portal 渲染且为青松皮肤', async () => {
  render(
    <Select>
      <SelectTrigger data-testid="ui-select-trigger">
        <SelectValue placeholder="选主题" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="morning">晨松</SelectItem>
      </SelectContent>
    </Select>,
  )
  const trigger = screen.getByTestId('ui-select-trigger')
  expect(trigger.className).toContain('bg-surface')
  expect(trigger.className).toContain('focus:ring-ring')
  fireEvent.focus(trigger)
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  const content = await screen.findByTestId('ui-select-content')
  expect(content.className).toContain('bg-surface')
  expect(content.className).toContain('rounded-card')
  expect(screen.getByRole('option', { name: '晨松' })).toBeInTheDocument()
})

test('ArrowDown 高亮 + Enter 选中：触发器显示所选值（受控整环）', async () => {
  function Harness() {
    const [v, setV] = useState('')
    return (
      <Select value={v} onValueChange={setV}>
        <SelectTrigger data-testid="ui-select-trigger">
          <SelectValue placeholder="选主题" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="morning">晨松</SelectItem>
          <SelectItem value="night">夜航</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  render(<Harness />)
  const trigger = screen.getByTestId('ui-select-trigger')
  fireEvent.focus(trigger)
  fireEvent.keyDown(trigger, { key: 'ArrowDown' }) // 打开并高亮首项
  await screen.findByTestId('ui-select-content')
  // 等高亮真正落到首项（Radix 异步移焦），方向键派发到条目元素本身
  const first = await waitFor(() => {
    const el = screen.getByRole('option', { name: '晨松' })
    expect(el).toHaveAttribute('data-highlighted')
    return el
  })
  fireEvent.keyDown(first, { key: 'ArrowDown' })
  const second = await waitFor(() => {
    const el = screen.getByRole('option', { name: '夜航' })
    expect(el).toHaveAttribute('data-highlighted')
    return el
  })
  fireEvent.keyDown(second, { key: 'Enter' })
  await waitFor(() => expect(trigger).toHaveTextContent('夜航'))
  expect(screen.queryByTestId('ui-select-content')).not.toBeInTheDocument()
})
