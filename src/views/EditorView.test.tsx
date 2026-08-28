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
  await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeInTheDocument())
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
  await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeInTheDocument())
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await waitFor(() => expect(screen.getByTestId('dirty-badge')).toBeInTheDocument())
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
  expect(JSON.parse(await fs.readTextFile('/ws/a.zen.json')).version).toBe(1)
})

test('返回文件库前冲刷未保存修改', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} />)
  await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeInTheDocument())
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('btn-back'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})
