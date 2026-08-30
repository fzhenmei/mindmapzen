import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Input } from './input'

// Input（M14 Task 2 官方源码重置）：定位用角色（textbox）与官方 data-slot，
// 皮肤断言对官方类（透明底 + input 边 + 3px 软焦点环）。

test('渲染输入框：官方皮肤类、placeholder 着 muted 色', () => {
  render(<Input placeholder="文件名" />)
  const input = screen.getByRole('textbox')
  expect(input).toHaveAttribute('placeholder', '文件名')
  expect(input).toHaveAttribute('data-slot', 'input')
  expect(input.className).toContain('border-input')
  expect(input.className).toContain('bg-transparent')
  expect(input.className).toContain('placeholder:text-muted-foreground')
  expect(input.className).toContain('focus-visible:ring-ring/50')
})

test('键入触发 onChange 且值受控流转', () => {
  function Harness() {
    const [v, setV] = useState('')
    return <Input value={v} onChange={(e) => setV(e.target.value)} />
  }
  render(<Harness />)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: '读书笔记.md' } })
  expect(input).toHaveValue('读书笔记.md')
})
