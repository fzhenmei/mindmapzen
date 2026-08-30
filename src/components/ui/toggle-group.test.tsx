import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from './toggle-group'

// type=single 时 Radix 把组渲染为 radiogroup、条目为 radio（roving tabindex），按 role 查询

test('渲染多钮组，未选中态为 surface 皮肤', () => {
  render(
    <ToggleGroup type="single">
      <ToggleGroupItem value="list">列表</ToggleGroupItem>
      <ToggleGroupItem value="grid">网格</ToggleGroupItem>
    </ToggleGroup>,
  )
  const group = screen.getByTestId('ui-toggle-group')
  expect(group).toHaveAttribute('role', 'radiogroup')
  expect(group.className).toContain('inline-flex')
  const item = screen.getByRole('radio', { name: '列表' })
  expect(item.className).toContain('bg-card')
  expect(item).toHaveAttribute('data-state', 'off')
})

test('type=single 点击选中：state=on + 青松选中皮肤 + 再点取消', () => {
  function Harness() {
    const [v, setV] = useState('list')
    return (
      <ToggleGroup type="single" value={v} onValueChange={setV}>
        <ToggleGroupItem value="list">列表</ToggleGroupItem>
        <ToggleGroupItem value="grid">网格</ToggleGroupItem>
      </ToggleGroup>
    )
  }
  render(<Harness />)
  fireEvent.click(screen.getByRole('radio', { name: '网格' }))
  const grid = screen.getByRole('radio', { name: '网格' })
  expect(grid).toHaveAttribute('data-state', 'on')
  expect(grid.className).toContain('data-[state=on]:bg-secondary')
  expect(screen.getByRole('radio', { name: '列表' })).toHaveAttribute('data-state', 'off')
  fireEvent.click(grid)
  expect(screen.getByRole('radio', { name: '网格' })).toHaveAttribute('data-state', 'off')
})
