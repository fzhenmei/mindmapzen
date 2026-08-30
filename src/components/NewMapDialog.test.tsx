import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, test } from 'vitest'
import NewMapDialog from './NewMapDialog'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

beforeEach(async () => {
  const fs = new MemoryFsAdapter()
  // 用户模板一份：验证内置+用户合并清单
  await fs.mkdir('/ws/templates')
  await fs.writeTextFileAtomic('/ws/templates/周会.md', '# 周会\n')
  useAppStore.getState().setAdapter(fs)
  await useAppStore.getState().setWorkspace('/ws')
})

test('新建对话框：名称输入 + 模板选择器（默认空白），testid 沿用旧契约', async () => {
  const onConfirm = vi.fn()
  render(<NewMapDialog onCancel={vi.fn()} onConfirm={onConfirm} />)
  // 旧契约沿用：直接输名称回车的肌肉记忆入口
  expect(screen.getByTestId('input-name')).toBeInTheDocument()
  expect(screen.getByTestId('btn-confirm')).toBeInTheDocument()
  // 模板选择器在位，默认选中空白（SelectValue 直显当前项）；选项渲染与选择交互由 E2E 覆盖
  // （Radix Select 选项仅打开后渲染，jsdom 驱动不开——真浏览器才是它的主场）
  const trigger = screen.getByTestId('template-select')
  expect(trigger).toBeInTheDocument()
  await waitFor(() => expect(trigger).toHaveTextContent('空白导图'))
})
