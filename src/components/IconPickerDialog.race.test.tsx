import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, test } from 'vitest'
import IconPickerDialog from './IconPickerDialog'
import { loadIconSvg } from '../editor/zenIcons'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

// 2026-09 竞态回归锁（E2E icons「非精选图标」全量偶发失败的根因）：所选非精选图标的
// svg 经 loadIconSvg 异步入缓存，而 extras 同步派生自该缓存——svg 在途时保存会把
// 图标名落进 md 却丢失运行时注册（画布空占位）。锁两件事：在途保存钮禁用；失败名
// 宽容解锁（不锁死保存）。loadIconSvg 注入受控延迟（deferred），其余模块原样。
vi.mock('../editor/zenIcons', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../editor/zenIcons')>()
  return { ...orig, loadIconSvg: vi.fn() }
})

/** 挂起的 loadIconSvg resolve 句柄（每次调用入列，统一放行/统一失败） */
let resolvers: Array<(v: string | null) => void> = []

beforeEach(async () => {
  resolvers = []
  vi.mocked(loadIconSvg).mockImplementation(
    () => new Promise<string | null>((resolve) => { resolvers.push(resolve) }),
  )
  useAppStore.getState().setAdapter(new MemoryFsAdapter())
  await useAppStore.getState().setWorkspace('/ws')
})

test('svg 在途：保存钮禁用；就绪后解禁且 extras 完整携带（不静默丢图标）', async () => {
  const onConfirm = vi.fn()
  render(<IconPickerDialog nodeText="节点" current={[]} onCancel={vi.fn()} onConfirm={onConfirm} />)
  fireEvent.input(screen.getByTestId('icon-search'), { target: { value: 'shield-alert' } })
  // 搜索结果先行渲染（loading 期即可点选——竞态入口）
  const item = await screen.findByTestId('icon-item-shield-alert', {}, { timeout: 8000 })
  fireEvent.click(item)
  // 竞态窗口：svg 未入缓存，保存必须禁用（否则 extras 滤掉该图标）
  expect(screen.getByTestId('icon-save')).toBeDisabled()
  // svg 就绪 → 缓存入位 → 解禁
  for (const r of resolvers) r('<svg class="lucide lucide-shield-alert"></svg>')
  await waitFor(() => expect(screen.getByTestId('icon-save')).toBeEnabled())
  fireEvent.click(screen.getByTestId('icon-save'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  const [names, extras] = onConfirm.mock.calls[0] as [
    string[],
    Array<{ name: string; icon: string }>,
  ]
  expect(names).toEqual(['shield-alert'])
  expect(extras.map((e) => e.name)).toEqual(['shield-alert'])
  expect(extras[0]!.icon).toMatch(/^<svg/)
})

test('svg 加载失败：保存不锁死（宽容丢弃，名字仍可应用）', async () => {
  const onConfirm = vi.fn()
  render(<IconPickerDialog nodeText="节点" current={[]} onCancel={vi.fn()} onConfirm={onConfirm} />)
  // 异名于上一用例：svg 缓存/失败名单均为模块级，跨用例残留会让在途判定直接短路
  fireEvent.input(screen.getByTestId('icon-search'), { target: { value: 'book-search' } })
  const item = await screen.findByTestId('icon-item-book-search', {}, { timeout: 8000 })
  fireEvent.click(item)
  expect(screen.getByTestId('icon-save')).toBeDisabled()
  // 失败（名字不在全集返回 null）→ 解锁；extras 宽容为空，names 照常携带
  for (const r of resolvers) r(null)
  await waitFor(() => expect(screen.getByTestId('icon-save')).toBeEnabled())
  fireEvent.click(screen.getByTestId('icon-save'))
  const [names, extras] = onConfirm.mock.calls[0] as [
    string[],
    Array<{ name: string; icon: string }>,
  ]
  expect(names).toEqual(['book-search'])
  expect(extras).toEqual([])
})
