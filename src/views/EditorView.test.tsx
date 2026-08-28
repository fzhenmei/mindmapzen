import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import EditorView from './EditorView'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import type { MindMapHandle } from '../types/engine'

// 引擎依赖真实 DOM 布局，组件测试用假画布
// fakeRootNode/fakeChildNode：renderer.findNodeByUid 返回的"节点实例"（稳定引用，供命令参数断言）
const fakeRootNode = { uid: 'root-uid' }
const fakeChildNode = { uid: 'child-uid' }
let fakeHandle: MindMapHandle
vi.mock('../editor/MindMapCanvas', () => ({
  default: ({
    onReady,
    onDataChange,
    onActiveChange,
    onEditorPaste,
  }: {
    onReady: (h: MindMapHandle) => void
    onDataChange: () => void
    onActiveChange?: (uid: string | null) => void
    onEditorPaste?: (rawText: string) => void
  }) => {
    fakeHandle = {
      // getData 树带 uid（引擎真实数据由 renderer 生成，见 Render.js/引擎核验笔记）
      getData: () => ({
        data: { text: '根', expand: true, uid: 'root-uid' },
        children: [{ data: { text: '新分支', expand: true, uid: 'child-uid' }, children: [] }],
      }),
      execCommand: vi.fn(),
      destroy: vi.fn(),
      renderer: {
        // 引擎 renderer.findNodeByUid（Render.js:2094）：uid → 节点实例，未命中 null
        findNodeByUid: (uid: string) =>
          uid === 'root-uid' ? fakeRootNode : uid === 'child-uid' ? fakeChildNode : null,
        textEdit: { hideEditTextBox: vi.fn() },
      },
    }
    ;(globalThis as unknown as Record<string, unknown>).__emitReady = () => onReady(fakeHandle)
    ;(globalThis as unknown as Record<string, unknown>).__emitChange = () => onDataChange()
    ;(globalThis as unknown as Record<string, unknown>).__emitActive = (uid: string | null) =>
      onActiveChange?.(uid)
    ;(globalThis as unknown as Record<string, unknown>).__emitPaste = (raw: string) =>
      onEditorPaste?.(raw)
    return <div data-testid="fake-canvas" />
  },
}))

let fs: MemoryFsAdapter
const openInEditor = vi.fn()

beforeEach(async () => {
  fs = new MemoryFsAdapter()
  await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 新分支\n')
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({
    route: 'editor',
    workspaceDir: '/ws',
    currentMdPath: '/ws/a.md',
    maps: [],
    dirty: false,
    error: null,
  })
})

test('打开文档渲染画布并显示名称', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
})

test('解析失败显示错误面板与原文', async () => {
  await fs.writeTextFileAtomic('/ws/bad.md', '## 没有一级标题\n')
  render(<EditorView mdPath="/ws/bad.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  expect(await screen.findByText(/未找到根标题/)).toBeInTheDocument()
  expect(screen.getByText(/没有一级标题/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/bad.md')
})

test('读取失败显示错误面板并可纯文本打开', async () => {
  render(
    <EditorView mdPath="/ws/missing.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />,
  )
  expect(await screen.findByText(/无法读取文件/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/missing.md')
})

test('Ctrl+S 保存 md 与 sidecar 并清除脏标记', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
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
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('btn-back'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})

test('保存失败时提示错误且脏标记保留（数据不静默丢失）', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
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

test('返回时保存失败 → 留在编辑器且横幅提示', async () => {
  // 原子写持续失败（模拟磁盘故障）：文件内容已在 beforeEach 写入，读取不受影响
  fs.writeTextFileAtomic = vi.fn(async () => {
    throw new Error('磁盘占用')
  })
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('btn-back'))
  await waitFor(() => expect(useAppStore.getState().error).toContain('保存失败'))
  expect(useAppStore.getState().route).toBe('editor') // 未离开
  expect(useAppStore.getState().dirty).toBe(true)
})

// ---- 复制 md（整图 / 选中子树）----

test('复制整图：无选中时写入完整 md', async () => {
  const writes: string[] = []
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-copy'))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toBe('# 根\n\n## 新分支\n')
})

test('复制子树：选中 uid 时只写该分支（从 H1 重计）', async () => {
  const writes: string[] = []
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(
      'child-uid',
    )
  })
  fireEvent.click(screen.getByTestId('btn-copy'))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toBe('# 新分支\n')
})

test('快捷键 Ctrl+Shift+C 触发复制', async () => {
  const writes: string[] = []
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true, shiftKey: true })
  await waitFor(() => expect(writes).toHaveLength(1))
})

// ---- 多行粘贴执行（拆子节点，spec §3.6）----
// 单行粘贴不拦截是引擎侧行为（MindMapCanvas onPaste 放行），此处只验证 applyMultilinePaste
// 对收到的 raw 的执行语义。

test('多行粘贴拆子节点：首行替换被编辑节点文本，其余行逐个插入子节点', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  await screen.findByTestId('fake-canvas')
  // 先报选中再 ready：选中上报会触发重渲染、假画布工厂重跑并重赋 fakeHandle，
  // ready 放最后才能保证断言与 mmRef 持有同一实例
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(
      'child-uid',
    )
  })
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, (raw: string) => void>).__emitPaste!('a\nb\nc')
  // 编辑框先关闭（否则引擎 hideEditTextBox 会用旧框文本回写覆盖首行），再 SET_NODE_TEXT
  expect(fakeHandle.renderer?.textEdit.hideEditTextBox).toHaveBeenCalledTimes(1)
  expect(fakeHandle.execCommand).toHaveBeenCalledTimes(3)
  expect(fakeHandle.execCommand).toHaveBeenNthCalledWith(1, 'SET_NODE_TEXT', fakeChildNode, 'a')
  expect(fakeHandle.execCommand).toHaveBeenNthCalledWith(
    2,
    'INSERT_CHILD_NODE',
    false,
    [fakeChildNode],
    { text: 'b' },
  )
  expect(fakeHandle.execCommand).toHaveBeenNthCalledWith(
    3,
    'INSERT_CHILD_NODE',
    false,
    [fakeChildNode],
    { text: 'c' },
  )
})

test('多行粘贴拆分后无有效行（纯空白）不执行命令', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  await screen.findByTestId('fake-canvas')
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(
      'child-uid',
    )
  })
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, (raw: string) => void>).__emitPaste!('\n \n')
  expect(fakeHandle.execCommand).not.toHaveBeenCalled()
})

test('多行粘贴 uid 未命中渲染树时静默放弃（无命令执行）', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={openInEditor} writeClipboard={vi.fn()} />)
  await screen.findByTestId('fake-canvas')
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(
      'ghost-uid',
    )
  })
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, (raw: string) => void>).__emitPaste!('a\nb')
  expect(fakeHandle.execCommand).not.toHaveBeenCalled()
})
