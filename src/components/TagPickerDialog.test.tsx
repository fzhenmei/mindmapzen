// src/components/TagPickerDialog.test.tsx —— 标签选择器（与 IconPickerDialog 同构的增删 UI 通道）
import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import TagPickerDialog from './TagPickerDialog'

const props = (over: Partial<ComponentProps<typeof TagPickerDialog>> = {}) => ({
  nodeText: '买牛奶',
  current: ['采购'],
  used: ['采购', 'urgent', '待处理'],
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
  ...over,
})

describe('TagPickerDialog（节点标签选择器）', () => {
  test('打开即显：已选 chips + 全图已用列表（已选高亮），点已用 toggle 增删', () => {
    render(<TagPickerDialog {...props()} />)
    expect(screen.getByTestId('tag-dialog')).toBeInTheDocument()
    expect(screen.getByText('买牛奶')).toBeInTheDocument()
    // 已选行
    expect(screen.getByTestId('tag-chip-采购')).toBeInTheDocument()
    // 已用列表已选项高亮（选中态类）
    expect(screen.getByTestId('tag-used-urgent')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tag-used-urgent'))
    expect(screen.getByTestId('tag-chip-urgent')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tag-used-urgent')) // 再点移除
    expect(screen.queryByTestId('tag-chip-urgent')).not.toBeInTheDocument()
  })

  test('输入回车添加新标签并清空输入', () => {
    render(<TagPickerDialog {...props()} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: '周末' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('tag-chip-周末')).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('')
  })

  test('输入未回车直接点保存：合法草稿一并提交（保存即隐式回车）', () => {
    const onConfirm = vi.fn()
    render(<TagPickerDialog {...props({ onConfirm })} />)
    fireEvent.change(screen.getByTestId('tag-input'), { target: { value: '周末' } })
    fireEvent.click(screen.getByTestId('tag-save'))
    expect(onConfirm).toHaveBeenCalledWith(['采购', '周末'])
  })

  test('未回车的草稿点保存仍走同一校验：空白/非法/重复不混入', () => {
    const onConfirm = vi.fn()
    render(<TagPickerDialog {...props({ onConfirm })} />)
    fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'a#b' } })
    fireEvent.click(screen.getByTestId('tag-save'))
    expect(onConfirm).toHaveBeenCalledWith(['采购'])
    fireEvent.change(screen.getByTestId('tag-input'), { target: { value: '采购' } }) // 重复
    fireEvent.click(screen.getByTestId('tag-save'))
    expect(onConfirm).toHaveBeenLastCalledWith(['采购'])
  })

  test('确认回调带回当前全量标签；点已选 chip 即移除', () => {
    const onConfirm = vi.fn()
    render(<TagPickerDialog {...props({ onConfirm })} />)
    fireEvent.click(screen.getByTestId('tag-chip-采购')) // 移除唯一已选
    fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'done' } })
    fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' })
    fireEvent.click(screen.getByTestId('tag-save'))
    expect(onConfirm).toHaveBeenCalledWith(['done'])
  })

  test('非法输入不添加（空白/含空格/含 #/重复名），输入保留供修改', () => {
    render(<TagPickerDialog {...props()} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '两个 词' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'a#b' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '采购' } }) // 与已选重复
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByTestId('tag-chip-两个 词')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tag-chip-a#b')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('tag-chip-采购')).toHaveLength(1) // 无重复
  })

  test('取消走 onCancel', () => {
    const p = props()
    render(<TagPickerDialog {...p} />)
    fireEvent.click(screen.getByTestId('tag-cancel'))
    expect(p.onCancel).toHaveBeenCalled()
  })
})
