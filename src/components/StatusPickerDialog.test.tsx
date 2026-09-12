// src/components/StatusPickerDialog.test.tsx —— 状态选择器（2026-09 看板模式 Task 8：
// 六态单选 + 「转为普通节点」清除项；确认携带所选 status / null，取消不回调）
import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import StatusPickerDialog from './StatusPickerDialog'

const props = (over: Partial<ComponentProps<typeof StatusPickerDialog>> = {}) => ({
  nodeText: '修滚动条',
  current: 'doing' as ComponentProps<typeof StatusPickerDialog>['current'],
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
  ...over,
})

describe('StatusPickerDialog（节点状态选择器）', () => {
  test('打开即显：六态全在场、当前态高亮、有状态时清除项在场', () => {
    render(<StatusPickerDialog {...props()} />)
    expect(screen.getByTestId('status-dialog')).toBeInTheDocument()
    expect(screen.getByText('修滚动条')).toBeInTheDocument()
    // 六态文案来自 kanban.status.* 词典（与看板列头同源）
    for (const label of ['待办', '进行中', '受阻', '完成', '放弃', '归档']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // 当前态 doing 高亮（选中态环），未选项无
    expect(screen.getByTestId('status-option-doing')).toHaveClass('ring-2')
    expect(screen.getByTestId('status-option-todo')).not.toHaveClass('ring-2')
    // current 非 null：清除项在场
    expect(screen.getByTestId('status-toplain')).toBeInTheDocument()
  })

  test('普通节点（current=null）：无高亮、无清除项', () => {
    render(<StatusPickerDialog {...props({ current: null })} />)
    expect(screen.getByTestId('status-option-doing')).not.toHaveClass('ring-2')
    expect(screen.queryByTestId('status-toplain')).not.toBeInTheDocument()
  })

  test('点选切换高亮；确认回调携带所选状态', () => {
    const onConfirm = vi.fn()
    render(<StatusPickerDialog {...props({ onConfirm })} />)
    fireEvent.click(screen.getByTestId('status-option-done'))
    expect(screen.getByTestId('status-option-done')).toHaveClass('ring-2')
    expect(screen.getByTestId('status-option-doing')).not.toHaveClass('ring-2')
    fireEvent.click(screen.getByTestId('status-save'))
    expect(onConfirm).toHaveBeenCalledWith('done')
  })

  test('选「转为普通节点」确认携带 null（清除徽章语义）', () => {
    const onConfirm = vi.fn()
    render(<StatusPickerDialog {...props({ onConfirm })} />)
    fireEvent.click(screen.getByTestId('status-toplain'))
    expect(screen.getByTestId('status-toplain')).toHaveClass('ring-2')
    fireEvent.click(screen.getByTestId('status-save'))
    expect(onConfirm).toHaveBeenCalledWith(null)
  })

  test('取消走 onCancel，不触发确认', () => {
    const p = props()
    render(<StatusPickerDialog {...p} />)
    fireEvent.click(screen.getByTestId('status-cancel'))
    expect(p.onCancel).toHaveBeenCalled()
    expect(p.onConfirm).not.toHaveBeenCalled()
  })
})
