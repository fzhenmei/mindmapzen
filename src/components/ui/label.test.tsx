import { render, screen } from '@testing-library/react'
import { Label } from './label'

// Label（M14 Task 2 新增，官方源码）：Radix Label 原语，点击聚焦关联控件（htmlFor）。

test('渲染标签并关联控件：for 关联 + 官方类', () => {
  render(
    <>
      <Label htmlFor="f">名称</Label>
      <input id="f" />
    </>,
  )
  const label = screen.getByText('名称')
  expect(label).toHaveAttribute('for', 'f')
  expect(label.className).toContain('text-sm')
  expect(label.className).toContain('font-medium')
})
