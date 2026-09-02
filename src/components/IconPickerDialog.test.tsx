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

// 2026-09 修复（用户反馈）：非精选图标不在默认网格（精选 64），不搜索看不到已选，
// 不知道关键词就无从移除。已选行：打开即全量在场（含非精选），点击即移除。
// 视觉（用户二审）：chip 只显示图标，悬停 title 显示名字——不显示名字文本
test('已选行：非精选已选不搜索也可见（悬停显名），点击即移除', async () => {
  const onConfirm = vi.fn()
  render(
    <IconPickerDialog nodeText="节点" current={['shield-alert', 'flag']} onCancel={vi.fn()} onConfirm={onConfirm} />,
  )
  const chip = screen.getByTestId('icon-chip-shield-alert')
  // 悬停提示与可访问名承载名字（chip 本体不显示名字文本）
  expect(chip).toHaveAttribute('title', '移除 shield-alert')
  expect(chip.textContent).not.toContain('shield-alert')
  // 精选 svg 直取同步在场；非精选异步补载后出图
  expect(screen.getByTestId('icon-chip-flag').querySelector('svg')).not.toBeNull()
  await waitFor(() => expect(chip.querySelector('svg')).not.toBeNull(), { timeout: 8000 })
  fireEvent.click(chip)
  fireEvent.click(screen.getByTestId('icon-save'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onConfirm.mock.calls[0]?.[0]).toEqual(['flag'])
})

test('已选行：无选中不渲染（空态隐藏）', () => {
  render(<IconPickerDialog nodeText="节点" current={[]} onCancel={vi.fn()} onConfirm={vi.fn()} />)
  expect(screen.queryByTestId('icon-chips')).not.toBeInTheDocument()
})
