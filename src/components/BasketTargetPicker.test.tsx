import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import BasketTargetPicker from './BasketTargetPicker'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

beforeEach(async () => {
  const fs = new MemoryFsAdapter()
  await fs.mkdir('/ws')
  await fs.writeTextFileAtomic('/ws/目标.md', '# 目标\n\n## 甲\n\n### 甲一\n')
  await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n')
  useAppStore.setState({
    adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md',
    maps: [
      { name: '目标', mdPath: '/ws/目标.md', relDir: '', modifiedAt: 2, createdAt: 1, size: 10 },
      { name: '点子篮子', mdPath: '/ws/点子篮子.md', relDir: '', modifiedAt: 1, createdAt: 1, size: 10 },
    ],
  })
})

test('选图（排除篮子）→ 选节点 → onPick 收到文本寻址器', async () => {
  const onPick = vi.fn()
  render(<BasketTargetPicker open onPick={onPick} onClose={() => {}} />)
  // 篮子自身不可选
  expect(screen.queryByTestId('picker-map-点子篮子')).toBeNull()
  await userEvent.click(screen.getByTestId('picker-map-目标'))
  expect(await screen.findByTestId('picker-node-甲')).toBeVisible()
  await userEvent.click(screen.getByTestId('picker-node-甲一'))
  expect(onPick).toHaveBeenCalledWith({ mapPath: '/ws/目标.md', path: ['目标', '甲'], text: '甲一' })
})

test('大纲节点搜索过滤', async () => {
  render(<BasketTargetPicker open onPick={() => {}} onClose={() => {}} />)
  await userEvent.click(screen.getByTestId('picker-map-目标'))
  await userEvent.type(screen.getByTestId('picker-search'), '甲一')
  expect(screen.getByTestId('picker-node-甲一')).toBeVisible()
  expect(screen.queryByTestId('picker-node-甲')).toBeNull()
})

// 超简报用例：慢读串图护栏（读盘竞态——陈旧响应晚于后一次选择返回时不得覆盖新大纲，
// 否则会产出 mapPath 与 path/text 错配的寻址器 = 把点子挂到错误的图/节点上）
test('陈旧读盘响应晚于后一次选择：不串用旧大纲', async () => {
  const fs = new MemoryFsAdapter()
  await fs.mkdir('/ws')
  await fs.writeTextFileAtomic('/ws/慢图.md', '# 慢图\n\n## 慢节点\n')
  await fs.writeTextFileAtomic('/ws/快图.md', '# 快图\n\n## 快节点\n')
  let releaseSlow: (() => void) | null = null
  const origRead = fs.readTextFile.bind(fs)
  fs.readTextFile = async (p: string): Promise<string> => {
    if (p === '/ws/慢图.md') await new Promise<void>((r) => { releaseSlow = r }) // 读盘挂起，由用例放行
    return origRead(p)
  }
  useAppStore.setState({
    adapter: fs,
    maps: [
      { name: '慢图', mdPath: '/ws/慢图.md', relDir: '', modifiedAt: 2, createdAt: 1, size: 10 },
      { name: '快图', mdPath: '/ws/快图.md', relDir: '', modifiedAt: 1, createdAt: 1, size: 10 },
    ],
  })
  const { rerender } = render(<BasketTargetPicker open onPick={() => {}} onClose={() => {}} />)
  await userEvent.click(screen.getByTestId('picker-map-慢图'))
  rerender(<BasketTargetPicker open={false} onPick={() => {}} onClose={() => {}} />)
  rerender(<BasketTargetPicker open onPick={() => {}} onClose={() => {}} />)
  await userEvent.click(screen.getByTestId('picker-map-快图'))
  expect(await screen.findByTestId('picker-node-快节点')).toBeVisible()
  releaseSlow!() // 放行陈旧读：其响应此刻才到
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  expect(screen.queryByTestId('picker-node-慢节点')).toBeNull()
  expect(screen.getByTestId('picker-node-快节点')).toBeVisible()
})
