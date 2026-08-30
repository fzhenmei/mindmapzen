import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, test } from 'vitest'
import IconPickerDialog from './IconPickerDialog'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// M18 验收实案：Vite JSON 动态导入返回 { default } 命名空间，直接当对象用则搜索恒空
beforeEach(async () => {
  useAppStore.getState().setAdapter(new MemoryFsAdapter())
  await useAppStore.getState().setWorkspace('/ws')
})

test('搜索命中全集：输入 check 出现 check 图标项（tags.json 解包链路）', async () => {
  render(<IconPickerDialog nodeText="节点" current={[]} onCancel={vi.fn()} onConfirm={vi.fn()} />)
  const input = screen.getByTestId('icon-search')
  fireEvent.input(input, { target: { value: 'check' } })
  // tags.json 懒加载 + 名字匹配（check/check-check 等），上限 24 项——至少 check 本尊在场
  await waitFor(
    () => expect(screen.getByTestId('icon-item-check')).toBeInTheDocument(),
    { timeout: 8000 },
  )
})

// M18 验收实案 2：搜索命中的非精选图标走懒加载——初版包内 URL 模板动态 import 运行时
// 全挂（显示 ×）。锁懒加载分支：flag-off 必须渲染出 svg 而非占位 '×'
test('搜索命中的非精选图标渲染 svg（icon-nodes.json 懒加载链路）', async () => {
  render(<IconPickerDialog nodeText="节点" current={[]} onCancel={vi.fn()} onConfirm={vi.fn()} />)
  fireEvent.input(screen.getByTestId('icon-search'), { target: { value: 'flag-off' } })
  const item = await screen.findByTestId('icon-item-flag-off', {}, { timeout: 8000 })
  await waitFor(
    () => {
      expect(item.querySelector('svg')).not.toBeNull()
      expect(item.textContent).not.toContain('×')
    },
    { timeout: 8000 },
  )
})
