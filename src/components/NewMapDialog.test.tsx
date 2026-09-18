import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, test } from 'vitest'
import NewMapDialog from './NewMapDialog'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

beforeEach(async () => {
  const fs = new MemoryFsAdapter()
  // 用户模板一份：验证内置+用户合并清单
  await fs.mkdir('/ws/templates')
  await fs.writeTextFileAtomic('/ws/templates/周会.md', '# 周会\n')
  // 目录树一份：项目 + 嵌套子目录（目录选择器数据源）
  await fs.mkdir('/ws/项目')
  await fs.mkdir('/ws/项目/子')
  useAppStore.getState().setAdapter(fs)
  await useAppStore.getState().setWorkspace('/ws')
  useAppStore.setState({ lastNewMapDir: '' })
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

// 2026-09 目录选择：保存位置选择器在位（jsdom 只验默认值文本，开列与点选交互走 E2E）
test('目录选择器在位：无 initialDir 无上次 → 默认显示根目录', async () => {
  render(<NewMapDialog onCancel={vi.fn()} onConfirm={vi.fn()} />)
  const trigger = screen.getByTestId('dir-select')
  await waitFor(() => expect(trigger).toHaveTextContent('根目录'))
})

// confirm 第三参透传初值目录（jsdom 开不了 Select，初值即确认值；改选交互由 E2E 覆盖）。
// 先等 dir-select 显示就绪（目录树异步拉取）再点确认——所见即所传
test('confirm 透传目录：默认根（无 initialDir 无上次）', async () => {
  const onConfirm = vi.fn()
  render(<NewMapDialog onCancel={vi.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(screen.getByTestId('dir-select')).toHaveTextContent('根目录'))
  fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('新图', undefined, ''))
})

test('confirm 透传目录：initialDir 优先（树右键「在此新建」入口）', async () => {
  const onConfirm = vi.fn()
  render(<NewMapDialog initialDir="项目" onCancel={vi.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(screen.getByTestId('dir-select')).toHaveTextContent('项目'))
  fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('新图', undefined, '项目'))
})

test('confirm 透传目录：initialDir=""（树根右键）显式根，不被上次选择覆盖', async () => {
  useAppStore.setState({ lastNewMapDir: '项目' })
  const onConfirm = vi.fn()
  render(<NewMapDialog initialDir="" onCancel={vi.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(screen.getByTestId('dir-select')).toHaveTextContent('根目录'))
  fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('新图', undefined, ''))
})

test('confirm 透传目录：记住上次选择（store.lastNewMapDir）', async () => {
  useAppStore.setState({ lastNewMapDir: '项目' })
  const onConfirm = vi.fn()
  render(<NewMapDialog onCancel={vi.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(screen.getByTestId('dir-select')).toHaveTextContent('项目'))
  fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('新图', undefined, '项目'))
})

test('上次目录已删 → 回退根（宽容降级，不阻断创建）', async () => {
  useAppStore.setState({ lastNewMapDir: '已删' })
  const onConfirm = vi.fn()
  render(<NewMapDialog onCancel={vi.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(screen.getByTestId('dir-select')).toHaveTextContent('根目录'))
  fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
  fireEvent.click(screen.getByTestId('btn-confirm'))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('新图', undefined, ''))
})
