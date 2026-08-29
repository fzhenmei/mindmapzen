import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Input } from './input'

test('渲染输入框：testid、青松皮肤类、placeholder 着 muted 色', () => {
  render(<Input placeholder="文件名" />)
  const input = screen.getByTestId('ui-input')
  expect(input).toHaveAttribute('placeholder', '文件名')
  expect(input.className).toContain('bg-surface')
  expect(input.className).toContain('border-border')
  expect(input.className).toContain('focus-visible:ring-ring')
  expect(input.className).toContain('placeholder:text-muted-foreground')
})

test('键入触发 onChange 且值受控流转', () => {
  function Harness() {
    const [v, setV] = useState('')
    return <Input value={v} onChange={(e) => setV(e.target.value)} />
  }
  render(<Harness />)
  const input = screen.getByTestId('ui-input')
  fireEvent.change(input, { target: { value: '读书笔记.md' } })
  expect(input).toHaveValue('读书笔记.md')
})
