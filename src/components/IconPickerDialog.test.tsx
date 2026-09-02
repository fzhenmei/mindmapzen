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

// 2026-09 修复：extras 此前只从当前搜索结果取——换搜索词后先前选中的非精选图标
// 丢失运行时注册（保存后当场渲染空占位）。锁累积缓存：跨词多选的 extras 全量在场
test('跨搜索词多选非精选图标：extras 全量携带（累积缓存，换词不丢）', async () => {
  const onConfirm = vi.fn()
  render(<IconPickerDialog nodeText="节点" current={[]} onCancel={vi.fn()} onConfirm={onConfirm} />)
  const search = screen.getByTestId('icon-search')
  fireEvent.input(search, { target: { value: 'flag-off' } })
  const first = await screen.findByTestId('icon-item-flag-off', {}, { timeout: 8000 })
  await waitFor(() => expect(first.querySelector('svg')).not.toBeNull(), { timeout: 8000 })
  fireEvent.click(first)
  fireEvent.input(search, { target: { value: 'shield-alert' } })
  const second = await screen.findByTestId('icon-item-shield-alert', {}, { timeout: 8000 })
  await waitFor(() => expect(second.querySelector('svg')).not.toBeNull(), { timeout: 8000 })
  fireEvent.click(second)
  fireEvent.click(screen.getByTestId('icon-save'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  const [names, extras] = onConfirm.mock.calls[0] as [
    string[],
    Array<{ name: string; icon: string }>,
  ]
  expect(names).toEqual(['flag-off', 'shield-alert'])
  expect(extras.map((e) => e.name).sort()).toEqual(['flag-off', 'shield-alert'])
  for (const e of extras) expect(e.icon).toMatch(/^<svg/)
})
