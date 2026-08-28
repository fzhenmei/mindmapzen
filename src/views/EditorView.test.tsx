import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import EditorView from './EditorView'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { MindMapHandle } from '../types/engine'

// 引擎依赖真实 DOM 布局，组件测试用假画布
let fakeHandle: MindMapHandle
vi.mock('../editor/MindMapCanvas', () => ({
  default: ({ onReady, onDataChange }: { onReady: (h: MindMapHandle) => void; onDataChange: () => void }) => {
    fakeHandle = {
      getData: () => ({
        data: { text: '根', expand: true },
        children: [{ data: { text: '新分支', expand: true }, children: [] }],
      }),
      execCommand: vi.fn(),
      destroy: vi.fn(),
    }
    ;(globalThis as unknown as Record<string, unknown>).__emitReady = () => onReady(fakeHandle)
    ;(globalThis as unknown as Record<string, unknown>).__emitChange = () => onDataChange()
    return <div data-testid="fake-canvas" />
  },
}))

let fs: MemoryFsAdapter
const openInEditor = vi.fn()

beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 新分支\n')
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ route: 'editor', workspaceDir: '/ws', currentMdPath: '/ws/a.md', maps: [], dirty: false, error: null })
})

test('打开文档渲染画布并显示名称', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} />)
  expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
})

test('解析失败显示错误面板与原文', async () => {
  await fs.writeTextFileAtomic('/ws/bad.md', '## 没有一级标题\n')
  render(<EditorView mdPath="/ws/bad.md" openInEditor={openInEditor} />)
  expect(await screen.findByText(/未找到根标题/)).toBeInTheDocument()
  expect(screen.getByText(/没有一级标题/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/bad.md')
})

test('读取失败显示错误面板并可纯文本打开', async () => {
  render(<EditorView mdPath="/ws/missing.md" openInEditor={openInEditor} />)
  expect(await screen.findByText(/无法读取文件/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/missing.md')
})

test('Ctrl+S 保存 md 与 sidecar 并清除脏标记', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} />)
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
  expect(JSON.parse(await fs.readTextFile('/ws/a.zen.json')).version).toBe(1)
})

test('返回文件库前冲刷未保存修改', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} />)
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('btn-back'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})

test('保存失败时提示错误且脏标记保留（数据不静默丢失）', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} />)
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  // 让原子写第一次调用抛错一次（随后恢复，模拟瞬时磁盘故障）
  const original = fs.writeTextFileAtomic.bind(fs)
  let thrown = false
  fs.writeTextFileAtomic = async (p: string, contents: string) => {
    if (!thrown) {
      thrown = true
      throw new Error('磁盘已满（模拟）')
    }
    return original(p, contents)
  }
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().error).toContain('保存失败'))
  expect(useAppStore.getState().error).toContain('磁盘已满')
  expect(useAppStore.getState().dirty).toBe(true)
  expect(screen.getByTestId('dirty-badge')).toBeInTheDocument()
})
