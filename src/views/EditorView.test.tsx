import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import EditorView from './EditorView'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { layoutToEngine } from '../editor/layoutMap'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { CloseGuardEvent, RegisterCloseGuard } from '../types/ports'

// 引擎依赖真实 DOM 布局，组件测试用假画布
// fakeRootNode/fakeChildNode：renderer.findNodeByUid 返回的"节点实例"（稳定引用，供命令参数断言）
const fakeRootNode = { uid: 'root-uid' }
const fakeChildNode = { uid: 'child-uid' }
// getData 树带 uid（引擎真实数据由 renderer 生成，见 Render.js/引擎核验笔记）。
// 模块级可变：写盘窗口用例改写它模拟「落了新编辑」（getData 每次取当前值，跨重渲染可见）
const defaultFakeTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [{ data: { text: '新分支', expand: true, uid: 'child-uid' }, children: [] }],
})
let fakeTree: EngineNode = defaultFakeTree()
let fakeHandle: MindMapHandle
vi.mock('../editor/MindMapCanvas', () => ({
  default: ({
    onReady,
    onDataChange,
    onActiveChange,
    onEditorPaste,
    layout,
  }: {
    onReady: (h: MindMapHandle) => void
    onDataChange: () => void
    onActiveChange?: (uid: string | null) => void
    onEditorPaste?: (rawText: string) => void
    layout?: string
  }) => {
    fakeHandle = {
      getData: () => fakeTree,
      execCommand: vi.fn(),
      setLayout: vi.fn(),
      resize: vi.fn(),
      el: null,
      view: { reset: vi.fn(), narrow: vi.fn(), enlarge: vi.fn(), x: 0, y: 0, scale: 1, transform: vi.fn() },
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
    // 挂载期 layout prop（引擎构造参数，Task 3）：记录供「打开恢复布局」用例断言
    ;(globalThis as unknown as Record<string, unknown>).__lastLayoutProp = layout
    return <div data-testid="fake-canvas" />
  },
}))

let fs: MemoryFsAdapter
const openInEditor = vi.fn()

// 既有用例的守卫桩：注册即弃（jsdom 无窗口关闭事件源），仅满足新 prop 契约
const noopRegister: RegisterCloseGuard = () => () => {}
const noopExitApp = () => {}

beforeEach(async () => {
  fs = new MemoryFsAdapter()
  fakeTree = defaultFakeTree()
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
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
})

test('解析失败显示错误面板与原文', async () => {
  await fs.writeTextFileAtomic('/ws/bad.md', '## 没有一级标题\n')
  render(
    <EditorView
      mdPath="/ws/bad.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  expect(await screen.findByText(/未找到根标题/)).toBeInTheDocument()
  expect(screen.getByText(/没有一级标题/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/bad.md')
})

test('读取失败显示错误面板并可纯文本打开', async () => {
  render(
    <EditorView
      mdPath="/ws/missing.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  expect(await screen.findByText(/无法读取文件/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/missing.md')
})

test('Ctrl+S 保存 md 与 sidecar 并清除脏标记', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
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
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('btn-back'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})

test('保存失败时提示错误且脏标记保留（数据不静默丢失）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
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
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
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
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
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
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
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
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
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
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
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
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
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
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
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

// ---- 关闭守卫（三态：保存 / 放弃 / 取消，spec §4 关闭拦截）----

/** 守卫测试脚手架：注册桩捕获 handler；fireClose 模拟窗口关闭请求，返回是否被拦截 */
const makeGuardStub = () => {
  let handler: ((e: CloseGuardEvent) => void) | null = null
  const register: RegisterCloseGuard = (h) => {
    handler = h
    return () => {
      handler = null
    }
  }
  return {
    register,
    fireClose: () => {
      let prevented = false
      act(() => {
        handler?.({ preventClose: () => (prevented = true) })
      })
      return prevented
    },
  }
}

/** 渲染到 dirty 状态并模拟一次窗口关闭：返回 [是否被拦截, exitApp spy] */
const renderDirtyAndClose = async (guard: ReturnType<typeof makeGuardStub>) => {
  const exitApp = vi.fn()
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={guard.register}
      exitApp={exitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  const prevented = guard.fireClose()
  return { prevented, exitApp }
}

test('关闭守卫：dirty 时拦截关闭并弹出三态对话框', async () => {
  const guard = makeGuardStub()
  const { prevented } = await renderDirtyAndClose(guard)
  expect(prevented).toBe(true)
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '关闭确认')
  expect(screen.getByText(/「a」有未保存的修改/)).toBeInTheDocument()
  expect(screen.getByTestId('closeguard-save')).toBeInTheDocument()
  expect(screen.getByTestId('closeguard-discard')).toBeInTheDocument()
  expect(screen.getByTestId('closeguard-cancel')).toBeInTheDocument()
})

test('关闭守卫：保存并关闭 → 落盘成功后 exitApp', async () => {
  // 预置旧内容：与假画布数据（# 根 / ## 新分支）不同，证明确实落了新盘
  await fs.writeTextFileAtomic('/ws/a.md', '# 旧根\n\n## 旧分支\n')
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-save'))
  await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
  expect(useAppStore.getState().dirty).toBe(false)
  await waitFor(() => expect(screen.queryByTestId('closeguard-save')).not.toBeInTheDocument())
})

test('关闭守卫：取消 → 关闭对话框不退出，再次关闭仍拦截', async () => {
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-cancel'))
  await waitFor(() => expect(screen.queryByTestId('closeguard-cancel')).not.toBeInTheDocument())
  expect(exitApp).not.toHaveBeenCalled()
  // 仍脏：第二次关闭请求依旧拦截并再次弹窗
  expect(guard.fireClose()).toBe(true)
  expect(await screen.findByTestId('closeguard-save')).toBeInTheDocument()
})

test('关闭守卫：放弃修改 → 不落盘直接退出', async () => {
  await fs.writeTextFileAtomic('/ws/a.md', '# 旧根\n\n## 旧分支\n')
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-discard'))
  await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 旧根\n\n## 旧分支\n') // 未保存
  // 僵尸态回归钉死：若 exitApp 失败窗口留下，store 脏标记必须已清（● 消失），
  // 否则"显示未保存但保存按钮 no-op"自相矛盾（v0.3.0 验收实案）
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
})

test('关闭守卫：保存失败 → 收起对话框留在应用（不静默退出）', async () => {
  fs.writeTextFileAtomic = vi.fn(async () => {
    throw new Error('磁盘占用')
  })
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-save'))
  await waitFor(() => expect(useAppStore.getState().error).toContain('保存失败'))
  expect(useAppStore.getState().dirty).toBe(true) // 数据未落盘不能丢
  expect(exitApp).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByTestId('closeguard-save')).not.toBeInTheDocument())
})

test('关闭守卫：干净状态（未修改）不拦截、无对话框', async () => {
  const guard = makeGuardStub()
  const exitApp = vi.fn()
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={guard.register}
      exitApp={exitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!() // 不触发 change：未修改
  expect(guard.fireClose()).toBe(false)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(exitApp).not.toHaveBeenCalled()
})

test('关闭守卫：对话框内连点保存不提前退出（落盘完成才退出且只退一次）', async () => {
  // 门闸：落盘挂起模拟慢盘；第二次点击走 saveNow 在途合并会立即返回 true，
  // 若无防重入将绕过等待直接 exitApp —— 落盘未完成即销毁窗口（数据丢失风险）
  let releaseWrite!: () => void
  const gate = new Promise<void>((r) => (releaseWrite = r))
  const original = fs.writeTextFileAtomic.bind(fs)
  fs.writeTextFileAtomic = async (p: string, contents: string) => {
    await gate
    return original(p, contents)
  }
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-save'))
  fireEvent.click(screen.getByTestId('closeguard-save')) // 第一次保存仍在途
  await act(async () => {}) // 排空微任务：提前退出路径若存在此处即暴露
  expect(exitApp).not.toHaveBeenCalled() // 落盘未完成不得退出
  releaseWrite()
  await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n') // 落盘完成
  expect(exitApp).toHaveBeenCalledTimes(1) // 也只有这一次
})

// ---- 写盘窗口与在途保存（终审修复回归：C1 保脏 / I1 保存链可等待 / I3 守卫防误触）----

/** 门闸桩：writeTextFileAtomic 全部经 gate 挂起，releaseWrite() 后（含补存轮）即刻放行 */
const hangWritesOnGate = () => {
  let releaseWrite!: () => void
  const gate = new Promise<void>((r) => (releaseWrite = r))
  const original = fs.writeTextFileAtomic.bind(fs)
  fs.writeTextFileAtomic = async (p: string, contents: string) => {
    await gate
    return original(p, contents)
  }
  return releaseWrite
}

test('写盘窗口内的新编辑不丢：清脏被修订号拦下并补存一轮（C1）', async () => {
  const releaseWrite = hangWritesOnGate()
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.keyDown(window, { key: 's', ctrlKey: true }) // 第一轮快照已取（旧内容），写盘挂起在途
  // 写盘窗口内落一次新编辑：改写引擎数据并上报变更（该编辑不在在途快照内）
  act(() => {
    fakeTree.children![0]!.data.text = '写盘窗口内的新分支'
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  })
  releaseWrite() // 在途写盘完成（落的是旧快照）；盲目清脏将使新编辑不在任何快照里且无人补存
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false)) // 补存轮完成后脏才清
  expect(await fs.readTextFile('/ws/a.md')).toContain('## 写盘窗口内的新分支') // 新编辑已落盘
  expect(await fs.readTextFile('/ws/a.md')).not.toContain('## 新分支\n') // 且非旧快照内容
})

test('在途保存时点返回：等待补存轮落盘完成才回文件库（I1）', async () => {
  const releaseWrite = hangWritesOnGate()
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.keyDown(window, { key: 's', ctrlKey: true }) // 第一轮保存挂起在途
  fireEvent.click(screen.getByTestId('btn-back')) // 在途合并：须等待当前轮消化补存标记后导航
  await act(async () => {}) // 排空微任务：合并分支若提前返回 true 将在此导航离开
  expect(useAppStore.getState().route).toBe('editor') // 落盘未完成不得离开
  releaseWrite()
  await waitFor(() => expect(useAppStore.getState().route).toBe('library')) // 落盘完成才回库
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})

test('在途保存时守卫保存：等待当前轮落盘完成才退出（I1）', async () => {
  const releaseWrite = hangWritesOnGate()
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.keyDown(window, { key: 's', ctrlKey: true }) // 先制造一轮在途保存
  expect(guard.fireClose()).toBe(true) // 在途时请求关闭 → 拦截弹框
  fireEvent.click(screen.getByTestId('closeguard-save')) // 守卫保存走合并分支
  await act(async () => {}) // 排空微任务：合并分支若提前返回 true 将立即 exitApp
  expect(exitApp).not.toHaveBeenCalled() // 补存未落盘不得退出
  releaseWrite()
  await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1)) // 落盘完成才退出
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})

test('保存在途点取消被挡下：不收框不退出，落盘完成后按保存路径退出（I3）', async () => {
  const releaseWrite = hangWritesOnGate()
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-save')) // 保存挂起在途
  fireEvent.click(screen.getByTestId('closeguard-cancel')) // 在途点取消：须被挡下（否则收框与在途落盘竞态）
  await act(async () => {}) // 排空微任务：误收/误退将在此暴露
  expect(screen.getByTestId('closeguard-cancel')).toBeInTheDocument() // 对话框仍在：取消未生效
  expect(exitApp).not.toHaveBeenCalled() // 仍在应用内：未提前退出
  releaseWrite()
  await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1)) // 在途保存完成后按原意图退出
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
})

test('保存在途点放弃被挡下：不清脏不退出，落盘完成后才退出（I3）', async () => {
  await fs.writeTextFileAtomic('/ws/a.md', '# 旧根\n\n## 旧分支\n') // 用旧内容反证最终落的是新盘
  const releaseWrite = hangWritesOnGate()
  const guard = makeGuardStub()
  const { exitApp } = await renderDirtyAndClose(guard)
  fireEvent.click(screen.getByTestId('closeguard-save')) // 保存挂起在途
  fireEvent.click(screen.getByTestId('closeguard-discard')) // 在途点放弃：须被挡下（否则清脏直退、在途写盘作废）
  await act(async () => {})
  expect(screen.getByTestId('closeguard-discard')).toBeInTheDocument() // 对话框仍在
  expect(exitApp).not.toHaveBeenCalled() // 未因放弃立即退出
  releaseWrite()
  await waitFor(() => expect(exitApp).toHaveBeenCalledTimes(1))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n') // 落的是保存的新内容而非放弃
})

// ---- 忽略块横幅与显式保存确认（spec §3.5 实施细化：自动保存静默）----

/** 渲染带未映射段落（「一段说明。」）的文档：打开成功即顶部横幅可见。
 *  独立路径 /ws/ignored.md，避免与 beforeEach 的 /ws/a.md 内容互相干扰。 */
const renderIgnoredMap = async (guard?: ReturnType<typeof makeGuardStub>) => {
  const exitApp = vi.fn()
  await fs.writeTextFileAtomic('/ws/ignored.md', '# 根\n\n一段说明。\n\n## A\n')
  render(
    <EditorView
      mdPath="/ws/ignored.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={guard ? guard.register : noopRegister}
      exitApp={exitApp}
    />,
  )
  await screen.findByTestId('ignored-banner')
  return { exitApp }
}

test('有忽略块时：显式保存先确认，确认后写盘且本会话不再弹', async () => {
  await renderIgnoredMap()
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.click(screen.getByTestId('btn-save'))
  expect(await screen.findByTestId('ignored-confirm-save')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('ignored-confirm-save'))
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/ignored.md')).not.toContain('一段说明')
  fireEvent.click(screen.getByTestId('btn-save')) // 第二次不再弹（本会话已确认）
  await waitFor(() => expect(screen.queryByTestId('ignored-confirm-save')).not.toBeInTheDocument())
})

test('Ctrl+S 同样先确认，确认后本会话二次不弹（快捷键监听只绑定一次）', async () => {
  await renderIgnoredMap()
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  expect(await screen.findByTestId('ignored-confirm-save')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('ignored-confirm-save'))
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/ignored.md')).not.toContain('一段说明')
  // 回归锁定：确认状态须能被只绑定一次的快捷键闭包读到——若 ignoredConfirmedRef
  // 被单独改回 state（按钮 handler 每次渲染取新闭包检不出），此处将再次弹确认
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await act(async () => {}) // 排空微任务：误弹的确认将在此后的同步查询中暴露
  expect(screen.queryByTestId('ignored-confirm-save')).not.toBeInTheDocument()
})

test('有修改时取消确认：不写盘、脏保留（数据不静默丢弃）', async () => {
  await renderIgnoredMap()
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.click(screen.getByTestId('btn-save'))
  expect(await screen.findByTestId('ignored-confirm-save')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('ignored-confirm-cancel'))
  await waitFor(() =>
    expect(screen.queryByTestId('ignored-confirm-cancel')).not.toBeInTheDocument(),
  )
  expect(await fs.readTextFile('/ws/ignored.md')).toContain('一段说明') // 未落盘
  expect(useAppStore.getState().dirty).toBe(true)
})

test('有忽略块时返回：确认挂起留在编辑器，确认后仅落盘不自动导航', async () => {
  await renderIgnoredMap()
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('btn-back'))
  expect(await screen.findByTestId('ignored-confirm-save')).toBeInTheDocument()
  expect(useAppStore.getState().route).toBe('editor') // 返回动作挂起，未离开
  fireEvent.click(screen.getByTestId('ignored-confirm-save'))
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/ignored.md')).not.toContain('一段说明') // 已落盘
  expect(useAppStore.getState().route).toBe('editor') // 不自动导航：用户需再点一次返回
})

test('有忽略块时守卫保存：收起守卫对话框改弹忽略确认，确认后仅落盘不退出', async () => {
  const guard = makeGuardStub()
  const { exitApp } = await renderIgnoredMap(guard)
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  expect(guard.fireClose()).toBe(true)
  expect(await screen.findByTestId('closeguard-save')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('closeguard-save'))
  // 守卫对话框收起，忽略块确认接管（不静默退出，也不静默丢弃）
  await waitFor(() => expect(screen.queryByTestId('closeguard-save')).not.toBeInTheDocument())
  expect(await screen.findByTestId('ignored-confirm-save')).toBeInTheDocument()
  expect(exitApp).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('ignored-confirm-save'))
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/ignored.md')).not.toContain('一段说明')
  expect(exitApp).not.toHaveBeenCalled() // 不退出：用户确认后需再次关闭窗口
})

test('有忽略块时自动保存静默落盘不弹确认（实施裁定：每 5 秒弹窗极扰人）', async () => {
  await renderIgnoredMap()
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  // 只 fake setTimeout/clearTimeout 控制自动保存防抖；fake 定时器下 RTL 的 findBy/waitFor
  // 自身会挂起，故后续改用 act 同步推进 + 同步查询
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    act(() => {
      ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    })
    expect(screen.getByTestId('dirty-badge')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    await act(async () => {}) // 排空落盘微任务
    expect(useAppStore.getState().dirty).toBe(false) // 已自动保存
    expect(await fs.readTextFile('/ws/ignored.md')).not.toContain('一段说明')
    expect(screen.queryByTestId('ignored-confirm-save')).not.toBeInTheDocument() // 未弹确认
  } finally {
    vi.useRealTimers()
  }
})

// ---- 布局三态切换（spec §3.7：即时生效不置脏，sidecar 随下次保存落盘；打开时以 sidecar.layout 为初值）----

test('视图工具组：−/＋ 缩放与根居中/适配可触发（数学由 viewOps 单测覆盖）', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={vi.fn()} writeClipboard={vi.fn()} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeInTheDocument())
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-zoom-out'))
  expect(fakeHandle.view.narrow).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('btn-zoom-in'))
  expect(fakeHandle.view.enlarge).toHaveBeenCalledTimes(1)
  // 假画布 renderer 无 root：根居中/适配走守卫早退，不崩溃即可（数学见 viewOps.test）
  fireEvent.click(screen.getByTestId('btn-center-root'))
  fireEvent.click(screen.getByTestId('btn-fit'))
})

test('布局切换：点击写 sidecar 值（保存时落盘）且不置脏', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  const handle = fakeHandle // ready 时刻实例即 mmRef 所持：后续重渲染 mock 会重建 fakeHandle，断言须用旧引用
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.click(screen.getByTestId('layout-org'))
  expect(useAppStore.getState().dirty).toBe(true) // 来自前面的 __emitChange，与切换无关
  expect(handle.setLayout).toHaveBeenCalledWith(layoutToEngine('org'))
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  const sc = JSON.parse(
    await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/ws/a.zen.json'),
  )
  expect(sc.layout).toBe('org')
})

test('打开文档：sidecar.layout 作为画布初值并点亮对应按钮', async () => {
  await fs.writeTextFileAtomic(
    '/ws/b.zen.json',
    JSON.stringify({ version: 1, layout: 'logic', collapsed: [] }),
  )
  await fs.writeTextFileAtomic('/ws/b.md', '# 根\n\n## 新分支\n')
  render(
    <EditorView
      mdPath="/ws/b.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  expect((globalThis as unknown as Record<string, unknown>).__lastLayoutProp).toBe(
    layoutToEngine('logic'),
  )
  expect(screen.getByTestId('layout-logic')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('layout-mindmap')).toHaveAttribute('aria-pressed', 'false')
})

test('布局切换：干净状态下 sidecar 即时落盘，仅写 sidecar 不写 .md 不置脏', async () => {
  // 审查裁定：writeOnce 的 !dirty 早退会使偏好永不落盘，切换须即时持久化 sidecar
  const writes: string[] = []
  const original = fs.writeTextFileAtomic.bind(fs)
  fs.writeTextFileAtomic = async (p, contents) => {
    writes.push(p)
    return original(p, contents)
  }
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  // 不触发 __emitChange：文档干净（writeOnce 早退路径），偏好仍须落盘
  fireEvent.click(screen.getByTestId('layout-org'))
  await act(async () => {}) // 排空 fire-and-forget 落盘微任务
  const sc = JSON.parse(await fs.readTextFile('/ws/a.zen.json'))
  expect(sc.layout).toBe('org')
  expect(writes).toEqual(['/ws/a.zen.json']) // 仅 sidecar，.md 未动
  expect(useAppStore.getState().dirty).toBe(false) // 依旧不置脏
})

test('布局切换：sidecar 即时落盘失败提示横幅（偏好丢失不静默）', async () => {
  fs.writeTextFileAtomic = vi.fn(async () => {
    throw new Error('磁盘占用')
  })
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn()}
      registerCloseGuard={noopRegister}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('layout-org'))
  await waitFor(() => expect(useAppStore.getState().error).toContain('保存布局失败'))
  expect(useAppStore.getState().error).toContain('磁盘占用')
})

describe('偏好布局（验收轮三：记住默认视图）', () => {
  test('无 sidecar 的导图按偏好布局打开', async () => {
    await fs.writeTextFileAtomic('/ws/bare.md', '# 裸图\n') // 无 .zen.json
    useAppStore.setState({ preferredLayout: 'logic' })
    render(<EditorView mdPath="/ws/bare.md" openInEditor={vi.fn()} writeClipboard={vi.fn()} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeInTheDocument())
    expect(screen.getByTestId('layout-logic')).toHaveAttribute('aria-pressed', 'true')
  })

  test('切换布局会记住偏好', async () => {
    useAppStore.setState({ preferredLayout: 'mindmap' })
    render(<EditorView mdPath="/ws/a.md" openInEditor={vi.fn()} writeClipboard={vi.fn()} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('fake-canvas')).toBeInTheDocument())
    ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    fireEvent.click(screen.getByTestId('layout-org'))
    await waitFor(() => expect(useAppStore.getState().preferredLayout).toBe('org'))
  })
})
