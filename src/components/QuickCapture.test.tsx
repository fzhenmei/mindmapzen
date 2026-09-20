import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import QuickCapture from './QuickCapture'
import QuickCaptureForm from './QuickCaptureForm'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

beforeEach(async () => {
  const fs = new MemoryFsAdapter()
  await fs.mkdir('/ws')
  useAppStore.setState({ adapter: fs, workspaceDir: '/ws', basketRelPath: '点子篮子.md', basketEngine: null, resolvedLanguage: 'zh-CN' })
})

test('输入回车入篮：篮子文件出现点子，浮层关闭', async () => {
  const onClose = vi.fn()
  render(<QuickCapture open onClose={onClose} />)
  await userEvent.type(screen.getByTestId('capture-input'), '给导图加暗色主题')
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  const fs = useAppStore.getState().adapter
  expect(await fs.readTextFile('/ws/点子篮子.md')).toContain('给导图加暗色主题')
})

test('多行：首行文本、其余进正文', async () => {
  render(<QuickCapture open onClose={() => {}} />)
  await userEvent.type(screen.getByTestId('capture-input'), '标题行{Shift>}{Enter}{/Shift}说明行')
  await userEvent.keyboard('{Enter}')
  const md = await useAppStore.getState().adapter.readTextFile('/ws/点子篮子.md')
  expect(md).toContain('标题行')
  expect(md).toContain('说明行')
})

test('空输入不提交、不关闭', async () => {
  const onClose = vi.fn()
  render(<QuickCapture open onClose={onClose} />)
  await userEvent.keyboard('{Enter}')
  expect(onClose).not.toHaveBeenCalled()
})

test('写失败：报错不关闭、内容保留', async () => {
  const failing = new MemoryFsAdapter()
  failing.exists = async () => { throw new Error('boom') } // 类方法在原型上，展开复制会丢——必须直接覆写实例
  useAppStore.setState({ adapter: failing })
  const onClose = vi.fn()
  render(<QuickCapture open onClose={onClose} />)
  await userEvent.type(screen.getByTestId('capture-input'), '会失败')
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByTestId('capture-error')).toBeVisible()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByTestId('capture-input')).toHaveValue('会失败')
})

test('IME 合成期 Enter 不提交（输入法确认候选不误触发入篮）', async () => {
  const onClose = vi.fn()
  render(<QuickCapture open onClose={onClose} />)
  await userEvent.type(screen.getByTestId('capture-input'), '未打完')
  // 合成期 Enter：userEvent 直填 value、不走合成事件，须 fireEvent 直发 keydown 才能带 isComposing
  fireEvent.keyDown(screen.getByTestId('capture-input'), { key: 'Enter', isComposing: true })
  await new Promise((r) => setTimeout(r, 0)) // 冲刷提交链（若有）再断言，避免竞态假绿
  expect(onClose).not.toHaveBeenCalled()
  expect(await useAppStore.getState().adapter.exists('/ws/点子篮子.md')).toBe(false)
  expect(screen.getByTestId('capture-input')).toHaveValue('未打完')
})

test('QuickCaptureForm 容器无关契约：失败保留草稿，成功清空并回调（spec §4.1）', async () => {
  const onSubmitted = vi.fn()
  useAppStore.setState({ captureIdea: async () => ({ ok: false, error: '写入失败' }) })
  const { rerender } = render(<QuickCaptureForm onSubmitted={onSubmitted} />)
  const input = screen.getByTestId('capture-input')
  fireEvent.change(input, { target: { value: '第一条' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(screen.getByTestId('capture-error')).toBeVisible())
  expect((input as HTMLTextAreaElement).value).toBe('第一条')
  expect(onSubmitted).not.toHaveBeenCalled()
  useAppStore.setState({ captureIdea: async () => ({ ok: true }) })
  rerender(<QuickCaptureForm onSubmitted={onSubmitted} />)
  fireEvent.keyDown(screen.getByTestId('capture-input'), { key: 'Enter' })
  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1))
  expect((screen.getByTestId('capture-input') as HTMLTextAreaElement).value).toBe('')
})
