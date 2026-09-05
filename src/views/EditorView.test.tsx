import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import EditorView from './EditorView'
import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { layoutToEngine } from '../editor/layoutMap'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { CloseGuardEvent, RegisterCloseGuard } from '../types/ports'

// 引擎依赖真实 DOM 布局，组件测试用假画布
// fakeRootNode/fakeChildNode：renderer.findNodeByUid 返回的"节点实例"（稳定引用，供命令参数断言）；
// getData 备注预填用（M5b）：child 带「既有备注」，root 无（undefined）
const fakeRootNode = { uid: 'root-uid', getData: () => undefined }
const fakeChildNode = { uid: 'child-uid', getData: (k: string) => (k === 'note' ? '既有备注' : undefined) }
// getData 树带 uid（引擎真实数据由 renderer 生成，见 Render.js/引擎核验笔记）。
// 模块级可变：写盘窗口用例改写它模拟「落了新编辑」（getData 每次取当前值，跨重渲染可见）
const defaultFakeTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [{ data: { text: '新分支', expand: true, uid: 'child-uid' }, children: [] }],
})
let fakeTree: EngineNode = defaultFakeTree()
let fakeHandle: MindMapHandle
// 假画布 applyRegistry 复用真 linkRegistry 纯函数（M5d Task 2 净化语义与生产一致；
// v0.7.0 起生产净化含引擎 targets 收割与落位（harvestRegistry/rebuildEngineLinks），
// 假画布镜像之：收割重建注册表 → 剥离显示文本 → 注册表解析结果写 data.associativeLineTargets）；
// vi.mock 工厂被提升到 import 之前，linkRegistry 须经工厂内动态 import 引入
vi.mock('../editor/MindMapCanvas', async () => {
  const { harvestRegistry, stripTreeTexts, registryToLinks } = await import('../editor/linkRegistry')
  // 迷你事件源（v1.1 撤销/重做）：假画布的 on/off 落进工厂级注册表，测试经 __emitHistory 驱动
  // useUndoRedo 订阅的 back_forward 历史态（listeners 跨重渲染持久——bind 注册在 ready 实例上）
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  /** rebuildEngineLinks 的 targets 落位镜像（免 offsets/重绘——单测只关心数据面）：
   *  全清后按解析结果重写（同生产「连线完全派生、重建即全清」语义） */
  const writeFakeTargets = (tree: EngineNode, reg: { byUid: Map<string, string[]> }): void => {
    const byPath = new Map<string, EngineNode[]>()
    const targets = new Map<EngineNode, string[]>()
    const walk = (node: EngineNode, parent: string): void => {
      const path = parent === '' ? '/' + node.data.text : parent + '/' + node.data.text
      const twins = byPath.get(path) ?? []
      twins.push(node)
      byPath.set(path, twins)
      delete node.data.associativeLineTargets
      for (const c of node.children ?? []) walk(c, path)
    }
    walk(tree, '')
    const pick = (path: string, ordinal?: number): EngineNode | undefined => {
      const twins = byPath.get(path)
      if (twins === undefined || twins.length === 0) return undefined
      return twins[Math.min(Math.max(ordinal ?? 1, 1), twins.length) - 1]
    }
    for (const { fromPath, toPath, fromOrdinal, toOrdinal } of registryToLinks(tree, reg)) {
      const from = pick(fromPath, fromOrdinal)
      const to = pick(toPath, toOrdinal)
      const uid = to?.data.uid
      if (!from || !to || from === to || typeof uid !== 'string') continue
      const list = targets.get(from) ?? []
      if (!list.includes(uid)) list.push(uid)
      targets.set(from, list)
    }
    targets.forEach((uids, from) => {
      from.data.associativeLineTargets = uids
    })
  }
  return {
    default: ({
      onReady,
      onDataChange,
      onActiveChange,
      onEditorPaste,
      onNodeCopy,
      layout,
      registry,
    }: {
      onReady: (h: MindMapHandle) => void
      onDataChange: () => void
      onActiveChange?: (uids: string[]) => void
      onEditorPaste?: (rawText: string) => void
      onNodeCopy?: () => void
      layout?: string
      registry: LinkRegistry
    }) => {
    fakeHandle = {
      getData: () => fakeTree,
      execCommand: vi.fn(),
      // M18 图标：opts 引用与设图标入口（真实语义见 MindMapCanvas 装配）
      opt: { iconList: [{ type: 'zen', list: [] }] },
      execCommandIcon: vi.fn(),
      // 导出插件（M5b Task 5）：png/svg 返回固定 data URL（引擎真实返回为 base64 字符串，见 exportImage.test）
      doExport: {
        png: vi.fn(async () => pngDataUrl),
        svg: vi.fn(async () => svgDataUrl),
      },
      // 事件订阅/退订（M5b Task 3 进 MindMapHandle；v1.1 起写进工厂级注册表供 back_forward 驱动）
      on: (ev: string, cb: (...args: unknown[]) => void) => {
        const list = listeners.get(ev) ?? []
        list.push(cb)
        listeners.set(ev, list)
      },
      off: vi.fn(),
      setLayout: vi.fn(),
      setTheme: vi.fn(),
      resize: vi.fn(),
      // 画布尺寸缓存(0×0 门禁/focus 自愈判定基准;正常态非 0 即可)
      width: 800,
      height: 600,
      el: null,
      view: { reset: vi.fn(), narrow: vi.fn(), enlarge: vi.fn(), x: 0, y: 0, scale: 1, transform: vi.fn() },
      destroy: vi.fn(),
      // 连线净化（M5d Task 2 + v0.7.0）：生产版等首帧渲染后走渲染树；假画布同步对 getData 树
      // 执行同款纯函数并镜像 targets 落位（M5d Task 5：记录 adjust 参数，供弯曲记忆恢复注入断言）
      applyRegistry: (adjust?: unknown) => {
        ;(globalThis as unknown as Record<string, unknown>).__lastApplyAdjust = adjust ?? null
        harvestRegistry(fakeTree, registry)
        stripTreeTexts(fakeTree)
        writeFakeTargets(fakeTree, registry)
      },
      renderer: {
        // 引擎 renderer.findNodeByUid（Render.js:2094）：uid → 节点实例，未命中 null
        findNodeByUid: (uid: string) =>
          uid === 'root-uid' ? fakeRootNode : uid === 'child-uid' ? fakeChildNode : null,
        textEdit: { hideEditTextBox: vi.fn() },
        // 备注保存后的按需重渲（M5b 核验 13：裸 SET_NODE_DATA 不重渲染）
        reRenderNodeCheckChange: vi.fn(),
        // 复制选中节点（对调后 Control+Shift+c 路径，EditorView 不经此，桩满足 EngineRenderer）
        copy: vi.fn(),
      },
    }
    ;(globalThis as unknown as Record<string, unknown>).__emitReady = () => onReady(fakeHandle)
    // v1.1 撤销/重做：向 back_forward 订阅者广播历史态（引擎 Command.js addHistory/back/forward 同款载荷）
    ;(globalThis as unknown as Record<string, unknown>).__emitHistory = (index: number, length: number) =>
      (listeners.get('back_forward') ?? []).forEach((cb) => cb(index, length))
    ;(globalThis as unknown as Record<string, unknown>).__emitChange = () => onDataChange()
    // 圈选多选镜像（2026-09）：桩对外仍收单 uid/null，转发时包装为 uid 数组（新契约，空数组 = 无选中）
    ;(globalThis as unknown as Record<string, unknown>).__emitActive = (uid: string | null) =>
      onActiveChange?.(uid ? [uid] : [])
    ;(globalThis as unknown as Record<string, unknown>).__emitPaste = (raw: string) =>
      onEditorPaste?.(raw)
    // 快捷键对调：Control+Shift+c 引擎节点复制成功上报（真实链路见 MindMapCanvas remap 闭包）
    ;(globalThis as unknown as Record<string, unknown>).__emitNodeCopy = () => onNodeCopy?.()
    // 挂载期 layout prop（引擎构造参数，Task 3）：记录供「打开恢复布局」用例断言
    ;(globalThis as unknown as Record<string, unknown>).__lastLayoutProp = layout
    return <div data-testid="fake-canvas" />
      },
  }
})

let fs: MemoryFsAdapter
const openInEditor = vi.fn()

// 导出测试样例（M5b Task 5）：与 exportImage.test 同款 PNG 魔数 data URL
const pngDataUrl = `data:image/png;base64,${btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47))}`
const svgDataUrl = `data:image/svg+xml;base64,${btoa('<svg/>')}`

// 既有用例的守卫桩：注册即弃（jsdom 无窗口关闭事件源），仅满足新 prop 契约
// 既有用例的导出端口桩：多数用例不触发导出，注册即弃（仅满足新 prop 契约）
const stubExportPorts = { pickSavePath: vi.fn(async () => null), writeImage: vi.fn() }
const noopRegister: RegisterCloseGuard = () => () => {}
const noopExitApp = () => {}
const stubPickImage = vi.fn(async () => ({ name: 'stub.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }))
// 剪贴板读图桩（粘贴截图）：缺省返回固定字节（与选图桩同款魔数）；用例可覆写返回 null 测空剪贴板
const stubReadClipboardImage = vi.fn(async () => ({ name: '粘贴.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }))

beforeEach(async () => {
  fs = new MemoryFsAdapter()
  fakeTree = defaultFakeTree()
  await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 新分支\n')
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({
    route: 'editor',
    workspaceDir: '/ws',
    currentMdPath: '/ws/a.md',
    editorSeq: 0, // 冲突 reload 用例断言递增，逐用例重置防跨用例泄漏
    maps: [],
    dirty: false,
    error: null,
    recentOpened: [], // 快速切换（v2.5）：候选与 ping-pong 数据源逐用例重置，防跨用例泄漏
    sessionRecent: [],
    mapTabs: [], // 顶部胶囊条（2026-09）：数据源逐用例重置，防跨用例泄漏
    settings: { copyIncludeNote: false, copyIncludeLinks: true },
    // 布局偏好隔离（M14）：早先用例点击布局组会经 setPreferredLayout 落 store；
    // ui ToggleGroup 官方语义「点已激活项=取消选择（onValueChange('')）」下，
    // 泄漏的偏好会让后续用例的布局点击命中已激活项而 no-op——统一回默认
    preferredLayout: 'mindmap',
  })
})

test('打开文档渲染画布并显示名称', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  expect(await screen.findByText(/未找到根标题/)).toBeInTheDocument()
  expect(screen.getByText(/没有一级标题/)).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('btn-raw-edit'))
  expect(openInEditor).toHaveBeenCalledWith('/ws/bad.md')
})

test('读取失败显示错误面板（分型文案，无修复按钮——文件不在无从修复）', async () => {
  render(
    <EditorView
      mdPath="/ws/missing.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  expect(await screen.findByText('无法打开此文件')).toBeInTheDocument()
  expect(screen.getByText(/文件可能已被移动、删除或没有访问权限/)).toBeInTheDocument()
  expect(screen.queryByTestId('btn-raw-edit')).not.toBeInTheDocument()
})

test('Ctrl+S 保存 md 与 sidecar 并清除脏标记', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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

// M5d Task 5 采集：保存链读引擎树 offsets（targets uid 数组 + 索引对齐差值数组）→ sidecar linkAdjust（路径对键）
test('保存采集连线弯曲：引擎 offsets → sidecar linkAdjust 路径对键', async () => {
  fakeTree = {
    data: {
      text: '根',
      expand: true,
      uid: 'root-uid',
      associativeLineTargets: ['child-uid'],
      associativeLineTargetControlOffsets: [[{ x: 9, y: 8 }, { x: 7, y: 6 }]],
    },
    children: [{ data: { text: '新分支', expand: true, uid: 'child-uid' }, children: [] }],
  }
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  const sidecar = JSON.parse(await fs.readTextFile('/ws/a.zen.json'))
  expect(sidecar.linkAdjust).toEqual({ '/根->/根/新分支': { cx1: 9, cy1: 8, cx2: 7, cy2: 6 } })
  // v0.7.0 起引擎 targets 是会话权威：保存收割入注册表 → md 句尾注入标记（该树源是根节点；md 仍是唯一事实源）
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根 [[新分支]]\n\n## 新分支\n')
})

// ---- 删线不复活（v0.7.0 验收修复）：引擎 targets 是会话权威，注册表收割为替换语义 ----
/** 删线样例树：A 经引擎 targets 连 B 与 C（净化会话语义——文本无标记，连线数据只在引擎层） */
const linkedTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [
    {
      data: { text: 'A', expand: true, uid: 'child-uid', associativeLineTargets: ['b-uid', 'c-uid'] },
      children: [],
    },
    { data: { text: 'B', expand: true, uid: 'b-uid' }, children: [] },
    { data: { text: 'C', expand: true, uid: 'c-uid' }, children: [] },
  ],
})

test('删线不复活：引擎 targets 删一后保存，md 缺该标记（注册表替换而非并集）', async () => {
  fakeTree = linkedTree()
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  // 首存：引擎两条连线都收割注入 md
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## A [[B]] [[C]]\n\n## B\n\n## C\n')
  // 引擎 Del（removeLine 修剪 targets，SET_NODE_DATA → data_change）：A→B 线被删
  fakeTree.children![0]!.data.associativeLineTargets = ['c-uid']
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  // 保存按引擎现态**替换**注册表：[[B]] 不再注回 md（并集语义下线将复活），[[C]] 保留
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## A [[C]]\n\n## B\n\n## C\n')
})

// M5d Task 5 恢复：打开时 sidecar linkAdjust 经 useLinkPurify 注入画布净化入口（purify → applyRegistry）
test('打开时 sidecar linkAdjust 注入画布弯曲恢复', async () => {
  await fs.writeTextFileAtomic(
    '/ws/a.zen.json',
    JSON.stringify({
      version: 1,
      linkAdjust: { '/根->/根/新分支': { cx1: 9, cy1: 8, cx2: 7, cy2: 6 }, '/失联->/键': { cx1: 1 } },
    }),
  )
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  expect((globalThis as unknown as Record<string, unknown>).__lastApplyAdjust).toEqual({
    '/根->/根/新分支': { cx1: 9, cy1: 8, cx2: 7, cy2: 6 },
    '/失联->/键': { cx1: 1 },
  })
})

test('返回文件库前冲刷未保存修改', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-copy'))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toBe('# 根\n\n## 新分支\n')
})

test('复制文件路径（砚栏路径钮，2026-09）：点击以 mdPath 绝对路径写剪贴板并盖「已复制」印', async () => {
  const writes: string[] = []
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-copy-path'))
  await waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toBe('/ws/a.md')
  await waitFor(() => expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制'))
})

test('复制文件路径（Windows，2026-09 修复）：混用分隔符的 mdPath 归一为全反斜杠', async () => {
  const writes: string[] = []
  await fs.writeTextFileAtomic('C:\\ws\\测试/投教课堂.md', '# 根\n')
  // jsdom 默认 platform=''（非 Windows 分支）；本用例 stub 成 Win32 走归一分支，测毕还原
  Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true })
  try {
    render(
      <EditorView
        mdPath={'C:\\ws\\测试/投教课堂.md'}
        openInEditor={openInEditor}
        writeClipboard={async (t) => {
          writes.push(t)
        }}
        exportPorts={stubExportPorts}
        registerCloseGuard={noopRegister}
        pickImageFile={stubPickImage}
        readClipboardImage={stubReadClipboardImage}
        exitApp={noopExitApp}
      />,
    )
    await screen.findByTestId('fake-canvas')
    ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    fireEvent.click(screen.getByTestId('btn-copy-path'))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toBe('C:\\ws\\测试\\投教课堂.md')
  } finally {
    Reflect.deleteProperty(navigator, 'platform')
  }
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
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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

test('快捷键 Ctrl+C 触发复制；输入域内放行原生复制', async () => {
  const writes: string[] = []
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  // 焦点在输入域（节点编辑框/备注文本区同构场景）时不截获——Ctrl+C 留给原生复制选中文本
  const editable = document.createElement('div')
  editable.setAttribute('contenteditable', 'true')
  document.body.appendChild(editable)
  fireEvent.keyDown(editable, { key: 'c', ctrlKey: true })
  expect(writes).toHaveLength(0)
  editable.remove()
  // 画布态（target 非 input/textarea/contenteditable）裸 Ctrl+C 触发复制 md
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
  await waitFor(() => expect(writes).toHaveLength(1))
})

// ---- 复制 md 给 AI（图片绝对路径，2026-09）----

test('复制带图节点：图片相对路径转绝对 + 头部说明行（头注在剥备注之后，不被误剥）', async () => {
  const writes: string[] = []
  // 子节点带插图（engineTreeToZen 还原 data.image/imageTitle，serialize 注入行尾标记）
  fakeTree = {
    data: { text: '根', expand: true, uid: 'root-uid' },
    children: [
      { data: { text: '配图', expand: true, uid: 'child-uid', image: 'assets/配图.png', imageTitle: '图注' }, children: [] },
    ],
  }
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-copy'))
  await waitFor(() => expect(writes).toHaveLength(1))
  // 默认 settings（剥备注）在前、图片转换在后：头注引用行存活，src 拼 workspaceDir 前缀
  expect(writes[0]).toBe('> 图片为本地绝对路径，请用工具读取\n\n# 根\n\n## 配图 ![图注](/ws/assets/配图.png)\n')
})

// ---- 复制后处理（M5b Task 4：settings 两开关）----
// 样例树：child 带 note「备注」与文本双链 [[B]]（备注/双链均由 data 携带，engineTreeToZen 还原）
const noteLinkTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [{ data: { text: '见 [[B]]', expand: true, uid: 'child-uid', note: '备注' }, children: [] }],
})

const copyWith = async (settings: { copyIncludeNote: boolean; copyIncludeLinks: boolean }): Promise<string> => {
  fakeTree = noteLinkTree()
  useAppStore.setState({ settings })
  const writes: string[] = []
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async (t) => {
        writes.push(t)
      }}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-copy'))
  await waitFor(() => expect(writes).toHaveLength(1))
  return writes[0]!
}

test('复制后处理：默认设置剥备注、留双链', async () => {
  expect(await copyWith({ copyIncludeNote: false, copyIncludeLinks: true })).toBe('# 根\n\n## 见 [[B]]\n')
})

test('复制后处理：copyIncludeNote=true 时保留 > 备注行', async () => {
  expect(await copyWith({ copyIncludeNote: true, copyIncludeLinks: true })).toBe('# 根\n\n## 见 [[B]]\n> 备注\n')
})

test('复制后处理：copyIncludeLinks=false 时 [[B]] 剥括号留名', async () => {
  expect(await copyWith({ copyIncludeNote: false, copyIncludeLinks: false })).toBe('# 根\n\n## 见 B\n')
})

// ---- 连线净化（M5d Task 2）：uid 注册表、显示剥离与序列化注入 ----
/** 净化样例树：child 文本含句中标记 [[B]]，b 为目标节点；md 与 fakeTree 同构 */
const purifyTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [
    { data: { text: 'A [[B]] 见', expand: true, uid: 'child-uid' }, children: [] },
    { data: { text: 'B', expand: true, uid: 'b-uid' }, children: [] },
  ],
})

test('连线净化：打开后画布文本剥离标记，保存句尾注入（句中标记规范化到句尾）', async () => {
  fakeTree = purifyTree()
  await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## A [[B]] 见\n\n## B\n')
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  // 画布文本已剥离（fake getData 无标记）
  expect(fakeTree.children![0]!.data.text).toBe('A 见')
  expect(fakeTree.children![1]!.data.text).toBe('B')
  // 净化不置脏：无 data_change，文档干净（显示层剥离不落盘）
  expect(useAppStore.getState().dirty).toBe(false)
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  // md 含 [[B]] 且在句尾（规范化形）
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## A 见 [[B]]\n\n## B\n')
})

test('连线净化：源节点改名后保存不断链（注册表以 uid 为键）', async () => {
  fakeTree = purifyTree()
  await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## A [[B]] 见\n\n## B\n')
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  // 源节点改名（uid 不变）：文本早已剥离，注册表条目仍命中
  fakeTree.children![0]!.data.text = '甲'
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
  await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
  expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 甲 [[B]]\n\n## B\n')
})

// ---- 印记（Task 7：显式保存成功朱砂印 / 复制成功墨青印，替代按钮内 ✓ 文案）----

test('显式保存成功盖「已存」印记，1.2s 后自动消失', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  // 只 fake setTimeout/clearTimeout 控印记的 1.2s 消失；fake 定时器下 RTL 的 waitFor 会挂起，
  // 故后续用 act 同步推进 + 同步查询（同自动保存静默用例模式）
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    fireEvent.click(screen.getByTestId('btn-save'))
    await act(async () => {}) // 排空落盘微任务：印记随保存成功渲染
    expect(useAppStore.getState().dirty).toBe(false)
    expect(screen.getByTestId('save-stamp')).toHaveTextContent('已存')
    expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-seal')
    act(() => {
      vi.advanceTimersByTime(1300)
    })
    expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('干净状态下保存为 no-op：不盖印记（无用户可感知的写盘）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!() // 不触发 change：文档干净
  fireEvent.click(screen.getByTestId('btn-save'))
  await act(async () => {})
  expect(useAppStore.getState().dirty).toBe(false)
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
})

test('复制成功盖「已复制为 Markdown」墨青印记（替代按钮内 ✓ 文案）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.click(screen.getByTestId('btn-copy'))
  await act(async () => {}) // 排空剪贴板微任务
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制为 Markdown')
  expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-ink')
  expect(screen.getByTestId('btn-copy')).not.toHaveTextContent('✓')
})

test('引擎节点复制上报盖「已复制为节点」墨青印记（Ctrl+Shift+C 路径）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={async () => {}}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  act(() => {
    ;(globalThis as unknown as Record<string, () => void>).__emitNodeCopy!()
  })
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制为节点')
  expect(screen.getByTestId('save-stamp')).toHaveClass('stamp-ink')
})

test('同会话到期卸载后再次保存可再次盖印（回归：stamp state 不得残留）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
  await screen.findByTestId('dirty-badge')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    fireEvent.click(screen.getByTestId('btn-save'))
    await act(async () => {})
    expect(screen.getByTestId('save-stamp')).toHaveTextContent('已存')
    act(() => {
      vi.advanceTimersByTime(1300)
    })
    expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument() // 到期已受控卸载
    act(() => {
      ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    })
    expect(screen.getByTestId('dirty-badge')).toBeInTheDocument() // 再次弄脏
    fireEvent.click(screen.getByTestId('btn-save'))
    await act(async () => {})
    // 二次盖印：若旧 stamp state 残留且同值 setStamp bail-out，印记将永不重现
    expect(screen.getByTestId('save-stamp')).toHaveTextContent('已存')
  } finally {
    vi.useRealTimers()
  }
})

test('1.2s 内连续两次复制：印记持续显示且计时重置（不提前消失）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    fireEvent.click(screen.getByTestId('btn-copy'))
    await act(async () => {})
    expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制为 Markdown')
    act(() => {
      vi.advanceTimersByTime(600) // 首枚计时过半（未到期）
    })
    expect(screen.getByTestId('save-stamp')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-copy')) // 窗口内第二次：seq 自增重挂载、计时重新起算
    await act(async () => {})
    act(() => {
      vi.advanceTimersByTime(700) // 距首枚 1300ms 已越其 1200ms：若未重置，印记将已消失
    })
    expect(screen.getByTestId('save-stamp')).toBeInTheDocument() // 距第二枚仅 700ms：仍在显示
    act(() => {
      vi.advanceTimersByTime(600) // 距第二枚 1300ms，越过其 1200ms
    })
    expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

// ---- 多行粘贴执行（拆子节点，spec §3.6）----
// 单行粘贴不拦截是引擎侧行为（MindMapCanvas onPaste 放行），此处只验证 applyMultilinePaste
// 对收到的 raw 的执行语义。

test('多行粘贴拆子节点：首行替换被编辑节点文本，其余行逐个插入子节点', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={guard.register}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
  expect(screen.getByTestId('closeguard-dialog')).toHaveAttribute('aria-label', '「a」有未保存的修改')
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={guard.register}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={exitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!() // 不触发 change：未修改
  expect(guard.fireClose()).toBe(false)
  expect(screen.queryByTestId('closeguard-dialog')).not.toBeInTheDocument()
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={guard ? guard.register : noopRegister}
      exitApp={exitApp}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
    expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument() // 印记只属于显式保存
  } finally {
    vi.useRealTimers()
  }
})

test('忽略块横幅展开显示中文类型名（段落而非 paragraph）', async () => {
  await renderIgnoredMap()
  fireEvent.click(screen.getByTestId('ignored-toggle'))
  expect(screen.getByTestId('ignored-list')).toHaveTextContent('段落：一段说明')
  expect(screen.getByTestId('ignored-list')).not.toHaveTextContent('paragraph')
})

// ---- 布局三态切换（spec §3.7：即时生效不置脏，sidecar 随下次保存落盘；打开时以 sidecar.layout 为初值）----

test('视图工具组：−/＋ 缩放与根居中/适配可触发（数学由 viewOps 单测覆盖）', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={vi.fn()} writeClipboard={vi.fn(async () => {})} exportPorts={stubExportPorts} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage} />)
  await screen.findByTestId('fake-canvas')
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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

test('更多布局下拉切换时间轴：走同一切换链路（引擎 setLayout + sidecar 即时落盘）', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  const handle = fakeHandle // ready 时刻实例即 mmRef 所持（同前用例理由）
  fireEvent.pointerDown(screen.getByTestId('btn-layout-more'), { button: 0 })
  fireEvent.click(screen.getByTestId('layout-timeline'))
  expect(handle.setLayout).toHaveBeenCalledWith(layoutToEngine('timeline'))
  await act(async () => {}) // 排空 fire-and-forget 落盘微任务
  const sc = JSON.parse(await (useAppStore.getState().adapter as MemoryFsAdapter).readTextFile('/ws/a.zen.json'))
  expect(sc.layout).toBe('timeline')
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  expect((globalThis as unknown as Record<string, unknown>).__lastLayoutProp).toBe(
    layoutToEngine('logic'),
  )
  expect(screen.getByTestId('layout-logic')).toHaveAttribute('data-state', 'on')
  expect(screen.getByTestId('layout-mindmap')).toHaveAttribute('data-state', 'off')
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
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
  expect(writes).toContain('/ws/a.zen.json') // sidecar 即时落盘
  // a4e2a51 起切换还会异步写 /cfg.json（偏好持久化，预期行为），故仅断言写路径不含 .md
  expect(writes.some((p) => p.endsWith('.md'))).toBe(false)
  expect(useAppStore.getState().dirty).toBe(false) // 依旧不置脏
})

test('布局切换：sidecar 即时落盘失败提示横幅（偏好丢失不静默）', async () => {
  // 抛错限定 sidecar 路径：切换还会 fire-and-forget 写 /cfg.json（偏好持久化，预期行为），
  // 若全路径抛错，该写入的未捕获拒绝会被 vitest 记为未处理错误（非零退出）
  fs.writeTextFileAtomic = vi.fn(async (p: string) => {
    if (p.endsWith('.zen.json')) throw new Error('磁盘占用')
  })
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
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
    render(<EditorView mdPath="/ws/bare.md" openInEditor={vi.fn()} writeClipboard={vi.fn(async () => {})} exportPorts={stubExportPorts} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage} />)
    await screen.findByTestId('fake-canvas')
    expect(screen.getByTestId('layout-logic')).toHaveAttribute('data-state', 'on')
  })

  test('切换布局会记住偏好', async () => {
    useAppStore.setState({ preferredLayout: 'mindmap' })
    render(<EditorView mdPath="/ws/a.md" openInEditor={vi.fn()} writeClipboard={vi.fn(async () => {})} exportPorts={stubExportPorts} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage} />)
    await screen.findByTestId('fake-canvas')
    ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    fireEvent.click(screen.getByTestId('layout-org'))
    await waitFor(() => expect(useAppStore.getState().preferredLayout).toBe('org'))
  })
})

// ---- 复制按钮 data-scope（M4 新增 E2E 信号：随选中态在 full/branch 间切换）----

test('复制按钮 data-scope 随选中态切换（E2E 信号）', async () => {
  render(<EditorView mdPath="/ws/a.md" openInEditor={vi.fn()} writeClipboard={vi.fn(async () => {})} exportPorts={stubExportPorts} registerCloseGuard={(h) => { void h; return () => {} }} exitApp={vi.fn()} pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage} />)
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  expect(screen.getByTestId('btn-copy')).toHaveAttribute('data-scope', 'full')
  ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('child-uid')
  await waitFor(() => expect(screen.getByTestId('btn-copy')).toHaveAttribute('data-scope', 'branch'))
  // 陈旧 uid 兜底：复制未命中时清除选中态（缓期项清偿）
  ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('ghost-uid')
  fireEvent.click(screen.getByTestId('btn-copy'))
  await waitFor(() => expect(screen.getByTestId('btn-copy')).toHaveAttribute('data-scope', 'full'))
})

// ---- 节点备注（M5b：btn-note → NoteDialog → SET_NODE_DATA + 按需重渲）----

/** 渲染并选中 child-uid 节点（备注对话框的常规前置）；ready 放 emitActive 后保证 mmRef 与返回实例同源。
 *  返回 ready 时刻的 handle：对话框开闭引发的假画布工厂重跑会重赋 fakeHandle，断言须锁定 mmRef 所持实例 */
const renderWithSelection = async (): Promise<MindMapHandle> => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={vi.fn()}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('child-uid')
  })
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  expect(screen.getByTestId('btn-note')).toBeEnabled()
  return fakeHandle
}

test('btn-note：选中节点打开对话框预填既有备注，保存调用 SET_NODE_DATA 并补按需重渲', async () => {
  const handle = await renderWithSelection()
  fireEvent.click(screen.getByTestId('btn-note'))
  const textarea = screen.getByTestId('note-text') as HTMLTextAreaElement
  expect(textarea.value).toBe('既有备注') // 预填节点实例 getData('note')
  fireEvent.change(textarea, { target: { value: '第一行\n第二行' } })
  fireEvent.click(screen.getByTestId('note-save'))
  // 空值置 undefined 的清除语义见下用例；此处整值写入
  expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
    note: '第一行\n第二行',
  })
  // 裸 SET_NODE_DATA 不重渲染（引擎核验 M5b (13)）：补调 reRenderNodeCheckChange 使角标即时增删
  expect(handle.renderer?.reRenderNodeCheckChange).toHaveBeenCalledWith(fakeChildNode)
  await waitFor(() => expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument())
})

test('btn-note：清空保存置 note=undefined（空值清除角标）', async () => {
  const handle = await renderWithSelection()
  fireEvent.click(screen.getByTestId('btn-note'))
  fireEvent.change(screen.getByTestId('note-text'), { target: { value: '' } })
  fireEvent.click(screen.getByTestId('note-save'))
  expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
    note: undefined,
  })
})

test('btn-note：Ctrl+Enter 保存（Enter 仍为换行，2026-09 快捷键）', async () => {
  const handle = await renderWithSelection()
  fireEvent.click(screen.getByTestId('btn-note'))
  const textarea = screen.getByTestId('note-text') as HTMLTextAreaElement
  // 裸 Enter 不保存（多行备注正常换行，不触发命令）
  fireEvent.keyDown(textarea, { key: 'Enter' })
  expect(handle.execCommand).not.toHaveBeenCalled()
  // Ctrl+Enter 即保存：整值写入并关框
  fireEvent.change(textarea, { target: { value: '快捷保存\n第二行' } })
  fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
  expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
    note: '快捷保存\n第二行',
  })
  await waitFor(() => expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument())
})

test('btn-note：取消不执行命令且对话框关闭', async () => {
  const handle = await renderWithSelection()
  fireEvent.click(screen.getByTestId('btn-note'))
  fireEvent.click(screen.getByTestId('note-cancel'))
  expect(handle.execCommand).not.toHaveBeenCalled()
  expect(handle.renderer?.reRenderNodeCheckChange).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument())
})

test('btn-note：无选中节点时禁用', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={vi.fn()}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  expect(screen.getByTestId('btn-note')).toBeDisabled()
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('child-uid')
  })
  expect(screen.getByTestId('btn-note')).toBeEnabled()
})

test('备注快捷键：Shift+F2 / Ctrl+. 打开选中节点的备注框（预填既有备注）', async () => {
  await renderWithSelection()
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  const textarea = screen.getByTestId('note-text') as HTMLTextAreaElement
  expect(textarea.value).toBe('既有备注') // 预填与 btn-note 同源（节点实例 getData('note')）
  fireEvent.click(screen.getByTestId('note-cancel'))
  await waitFor(() => expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument())
  fireEvent.keyDown(window, { key: '.', ctrlKey: true }) // Ctrl+. 同入口
  expect(screen.getByTestId('note-dialog')).toBeInTheDocument()
})

test('备注快捷键：无选中节点时不打开对话框', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={vi.fn()}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  fireEvent.keyDown(window, { key: '.', ctrlKey: true })
  await act(async () => {}) // 排空微任务：若误开对话框，随后的同步查询即暴露
  expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument()
})

test('备注快捷键：任一对话框在开时不再开备注框（互斥约定）', async () => {
  await renderWithSelection() // 有选中节点：仅互斥守卫能拦下（锁定 anyDialogRef 含导出框开态）
  fireEvent.click(screen.getByTestId('btn-export'))
  expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  await act(async () => {})
  expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument()
  expect(screen.getByTestId('export-dialog')).toBeInTheDocument() // 原对话框不受扰
})

// ---- 导出与复制为图片（M5b Task 5：btn-export → ExportDialog 三入口 → 端口注入）----

/** 渲染并 ready，返回 ready 时刻 handle（对话框开闭重渲染会重建 fakeHandle，断言须锁定 mmRef 所持实例） */
const renderReady = async (exportPorts: {
  pickSavePath(defaultName: string): Promise<string | null>
  writeImage(bytes: Uint8Array): Promise<void>
}): Promise<MindMapHandle> => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={vi.fn()}
      writeClipboard={vi.fn(async () => {})}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
            exportPorts={exportPorts}
    />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  return fakeHandle
}

test('btn-export：打开三入口对话框，复制为图片走 writeImage 桩并盖「已复制」印', async () => {
  const writeImage = vi.fn()
  await renderReady({ pickSavePath: vi.fn(async () => '/ws/a.png'), writeImage })
  fireEvent.click(screen.getByTestId('btn-export'))
  expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('export-copy'))
  await waitFor(() => expect(writeImage).toHaveBeenCalledTimes(1))
  const [bytes] = writeImage.mock.calls[0] as [Uint8Array]
  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(bytes.length).toBeGreaterThan(0)
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已复制')
  await waitFor(() => expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument())
})

test('导出 PNG：pickSavePath 收到默认文件名，字节经 writeBytes 落盘并盖「已存」印', async () => {
  const pickSavePath = vi.fn(async (n: string) => `/ws/出/${n}`)
  const handle = await renderReady({ pickSavePath, writeImage: vi.fn() })
  fireEvent.click(screen.getByTestId('btn-export'))
  fireEvent.click(screen.getByTestId('export-png'))
  await waitFor(() => expect(pickSavePath).toHaveBeenCalledWith('a.png'))
  await waitFor(async () => {
    const bytes = await fs.readBytes('/ws/出/a.png')
    expect(bytes).toHaveLength(4)
    expect([...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
  expect(handle.doExport?.png).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('save-stamp')).toHaveTextContent('已存')
})

test('导出 SVG：savePath 基名传给引擎 svg()（写入 svg <title>），落盘字节为 svg 串', async () => {
  const handle = await renderReady({ pickSavePath: vi.fn(async () => '/ws/子/我的图.svg'), writeImage: vi.fn() })
  fireEvent.click(screen.getByTestId('btn-export'))
  fireEvent.click(screen.getByTestId('export-svg'))
  await waitFor(() => expect(handle.doExport?.svg).toHaveBeenCalledWith('我的图'))
  await waitFor(async () => {
    expect(await fs.readBytes('/ws/子/我的图.svg')).toHaveLength('<svg/>'.length)
  })
})

test('保存对话框取消（pickSavePath 返回 null）：不写盘不盖印不报错', async () => {
  await renderReady({ pickSavePath: vi.fn(async () => null), writeImage: vi.fn() })
  fireEvent.click(screen.getByTestId('btn-export'))
  fireEvent.click(screen.getByTestId('export-png'))
  await act(async () => {}) // 排空取消链微任务
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
  expect(useAppStore.getState().error).toBeNull()
  expect(await fs.exists('/ws/a.png')).toBe(false)
})

test('导出失败（写盘抛错）：中文横幅提示且不盖印', async () => {
  fs.writeBytes = vi.fn(async () => {
    throw new Error('目标目录不存在')
  })
  await renderReady({ pickSavePath: vi.fn(async () => '/ws/a.png'), writeImage: vi.fn() })
  fireEvent.click(screen.getByTestId('btn-export'))
  fireEvent.click(screen.getByTestId('export-png'))
  await waitFor(() => expect(useAppStore.getState().error).toContain('导出失败'))
  expect(useAppStore.getState().error).toContain('目标目录不存在')
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
})

test('Esc 关闭导出对话框：无任何导出动作', async () => {
  const pickSavePath = vi.fn()
  const writeImage = vi.fn()
  const handle = await renderReady({ pickSavePath, writeImage })
  fireEvent.click(screen.getByTestId('btn-export'))
  // ZenDialog 已迁移 Radix Dialog：Esc 经其 document 捕获监听 → onClose
  fireEvent.keyDown(screen.getByTestId('export-dialog'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument())
  expect(pickSavePath).not.toHaveBeenCalled()
  expect(writeImage).not.toHaveBeenCalled()
  expect(handle.doExport?.png).not.toHaveBeenCalled()
})

test('保存对话框异常（pickSavePath 抛错）：中文横幅提示且不写盘不盖印', async () => {
  const pickSavePath = vi.fn(async () => {
    throw new Error('对话框插件崩溃')
  })
  await renderReady({ pickSavePath, writeImage: vi.fn() })
  fireEvent.click(screen.getByTestId('btn-export'))
  fireEvent.click(screen.getByTestId('export-png'))
  await waitFor(() => expect(useAppStore.getState().error).toContain('导出失败'))
  expect(useAppStore.getState().error).toContain('对话框插件崩溃')
  expect(screen.queryByTestId('save-stamp')).not.toBeInTheDocument()
  expect(await fs.exists('/ws/a.png')).toBe(false)
})

// ---- 回退/重做（v1.1，想法5）：砚栏按钮禁用态随 back_forward 历史态切换，点击走引擎命令 ----

test('回退/重做按钮：初始双禁用；历史态事件驱动启用；点击执行 BACK/FORWARD', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={vi.fn()}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  const handle = fakeHandle // ready 时刻实例即 mmRef 所持：点击经 bind 捕获的同一引用执行命令
  expect(screen.getByTestId('btn-undo')).toBeDisabled()
  expect(screen.getByTestId('btn-redo')).toBeDisabled()
  expect(screen.getByTestId('btn-undo')).toHaveAttribute('aria-label', '回退（Ctrl+Z）')
  expect(screen.getByTestId('btn-redo')).toHaveAttribute('aria-label', '重做（Ctrl+Y）')
  // 栈中间态（载荷 activeHistoryIndex=1 / history.length=3，即基线+两编辑且回退过一步）：双钮可用
  act(() => {
    ;(globalThis as unknown as Record<string, (i: number, l: number) => void>).__emitHistory!(1, 3)
  })
  expect(screen.getByTestId('btn-undo')).toBeEnabled()
  expect(screen.getByTestId('btn-redo')).toBeEnabled()
  fireEvent.click(screen.getByTestId('btn-undo'))
  expect(handle.execCommand).toHaveBeenCalledWith('BACK')
  fireEvent.click(screen.getByTestId('btn-redo'))
  expect(handle.execCommand).toHaveBeenCalledWith('FORWARD')
})

test('栈态边界：回退到基线（index=0）撤销钮禁用重做可用；清史（0,0）双禁用', async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={vi.fn()}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
          />,
  )
  await screen.findByTestId('fake-canvas')
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  act(() => {
    ;(globalThis as unknown as Record<string, (i: number, l: number) => void>).__emitHistory!(0, 2)
  })
  expect(screen.getByTestId('btn-undo')).toBeDisabled() // 栈底：无更早快照可回退
  expect(screen.getByTestId('btn-redo')).toBeEnabled()
  act(() => {
    ;(globalThis as unknown as Record<string, (i: number, l: number) => void>).__emitHistory!(0, 0)
  })
  expect(screen.getByTestId('btn-undo')).toBeDisabled()
  expect(screen.getByTestId('btn-redo')).toBeDisabled()
})

// ---- 快速切换（v2.5 编辑器内切换导图）：Ctrl+P 浮层 / Ctrl+Tab ping-pong / 切换安全链 ----

/** 快速切换用例装配：渲染编辑器（当前图 a；候选 recentOpened 与 MRU sessionRecent
 *  由 describe 级 beforeEach 预置——b 与 子/c 为候选，a 的上一张 = b） */
const renderForSwitch = async () => {
  render(
    <EditorView
      mdPath="/ws/a.md"
      openInEditor={openInEditor}
      writeClipboard={vi.fn(async () => {})}
      exportPorts={stubExportPorts}
      registerCloseGuard={noopRegister}
      pickImageFile={stubPickImage}
      readClipboardImage={stubReadClipboardImage}
      exitApp={noopExitApp}
    />,
  )
  await screen.findByTestId('fake-canvas')
}

describe('快速切换（v2.5）', () => {
  beforeEach(() => {
    useAppStore.setState({
      recentOpened: ['/ws/a.md', '/ws/b.md', '/ws/子/c.md'],
      sessionRecent: ['/ws/a.md', '/ws/b.md'],
    })
  })

  test('Ctrl+P 呼出浮层：候选含最近打开（跨会话）且不含当前图', async () => {
    await renderForSwitch()
    expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(screen.getByTestId('switch-input')).toBeInTheDocument()
    expect(screen.getAllByTestId('switch-item')).toHaveLength(2) // b 与 子/c；当前图 a 不入列
  })

  // v2.5：搜索候选 = 工作区全量（maps）+ 最近打开置顶（编辑内新建未回案头的图 maps 缺失由
  // recentOpened 兜底）；未打开过的文件也应可搜到——用户反馈「搜不到工作区文件」
  test('Ctrl+P 搜索工作区全量：最近打开置顶、其余按修改时间、未打开过的文件可搜到', async () => {
    useAppStore.setState({
      maps: [
        { name: '新品', mdPath: '/ws/新品.md', relDir: '', modifiedAt: 30, createdAt: 1, size: 1 },
        { name: '归档', mdPath: '/ws/项目/归档.md', relDir: '项目', modifiedAt: 20, createdAt: 1, size: 1 },
        { name: 'b', mdPath: '/ws/b.md', relDir: '', modifiedAt: 10, createdAt: 1, size: 1 },
        { name: 'c', mdPath: '/ws/子/c.md', relDir: '子', modifiedAt: 5, createdAt: 1, size: 1 },
      ],
    })
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    // 默认序：recentOpened（排除当前 a）= [b, c] 置顶，工作区其余按 mtime 降序 [新品, 归档]
    const names = screen.getAllByTestId('switch-item').map((el) => el.textContent)
    expect(names).toHaveLength(4)
    expect(names[0]).toContain('b')
    expect(names[1]).toContain('c')
    expect(names[2]).toContain('新品')
    expect(names[3]).toContain('归档')
    // 输入「归档」搜到从未打开过的工作区文件并切换
    fireEvent.change(screen.getByTestId('switch-input'), { target: { value: '归档' } })
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Enter' })
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/项目/归档.md'))
  })

  test('砚栏切换钮呼出浮层（鼠标路径）', async () => {
    await renderForSwitch()
    fireEvent.click(screen.getByTestId('btn-switch'))
    expect(screen.getByTestId('switch-input')).toBeInTheDocument()
  })

  test('浮层回车切换：干净状态直接 openMap 目标（含目录候选）', async () => {
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.change(screen.getByTestId('switch-input'), { target: { value: 'c' } })
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Enter' })
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/子/c.md'))
    // openMap 维护的会话 MRU：目标置顶
    expect(useAppStore.getState().sessionRecent[0]).toBe('/ws/子/c.md')
  })

  test('浮层回车切换：脏且保存失败 → 留在原图（横幅提示，数据不丢）', async () => {
    fs.writeTextFileAtomic = vi.fn(async () => {
      throw new Error('磁盘占用')
    })
    await renderForSwitch()
    ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    await screen.findByTestId('dirty-badge')
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Enter' })
    await waitFor(() => expect(useAppStore.getState().error).toContain('保存失败'))
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md') // 未切走
    expect(useAppStore.getState().dirty).toBe(true)
  })

  test('Ctrl+Tab 一按即松：呼出轮换浮层（无输入框、列表含当前图）并切到上一张', async () => {
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    await screen.findByTestId('switch-list')
    expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument() // 轮换态无输入框
    expect(screen.getAllByTestId('switch-item')).toHaveLength(2) // MRU 全序含当前 a：[a, b]
    fireEvent.keyUp(window, { key: 'Control' })
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/b.md'))
  })

  test('Ctrl+Tab 会话只开过当前一张：也呼浮层（列表仅当前），松 Ctrl 不切换', async () => {
    useAppStore.setState({ sessionRecent: ['/ws/a.md'] })
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    await screen.findByTestId('switch-list')
    expect(screen.getAllByTestId('switch-item')).toHaveLength(1) // 唯一项 = 当前图，高亮其上
    expect(screen.getAllByTestId('switch-item')[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyUp(window, { key: 'Control' })
    await waitFor(() => expect(screen.queryByTestId('switch-list')).not.toBeInTheDocument())
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md') // 落在当前 = 真 no-op
  })

  test('搜索浮层打开时 Ctrl+Tab no-op（互斥守卫），Esc 关闭后恢复', async () => {
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md')
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true }) // 关闭后轮换恢复
    fireEvent.keyUp(window, { key: 'Control' })
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/b.md'))
  })

  test('Ctrl+Tab 按住连按：高亮循环下移，轮回当前图松手不切（真 no-op）', async () => {
    useAppStore.setState({ sessionRecent: ['/ws/a.md', '/ws/b.md', '/ws/子/c.md'] })
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true }) // 开浮层（列表 [a,b,c]），高亮 b
    const activeText = () =>
      screen.getAllByTestId('switch-item').find((el) => el.getAttribute('aria-selected') === 'true')!.textContent
    expect(activeText()).toContain('b')
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true }) // 高亮 c
    await waitFor(() => expect(activeText()).toContain('c'))
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true }) // 循环回 a（当前图）
    await waitFor(() => expect(activeText()).toContain('a'))
    fireEvent.keyUp(window, { key: 'Control' })
    await waitFor(() => expect(screen.queryByTestId('switch-list')).not.toBeInTheDocument())
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md') // 落在当前 = 不切换不重载
  })

  test('Ctrl+Shift+Tab 反向轮换：首按从未项起', async () => {
    useAppStore.setState({ sessionRecent: ['/ws/a.md', '/ws/b.md', '/ws/子/c.md'] })
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey: true })
    const active = screen
      .getAllByTestId('switch-item')
      .find((el) => el.getAttribute('aria-selected') === 'true')!
    expect(active.textContent).toContain('c') // MRU 末项
    fireEvent.keyUp(window, { key: 'Control' })
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/子/c.md'))
  })

  test('轮换浮层 Esc 取消：关闭不切换', async () => {
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    await screen.findByTestId('switch-list')
    // Esc 从浮层内派发（真实浏览器焦点在浮层，radix 在 document 上收冒泡）
    fireEvent.keyDown(screen.getByTestId('switch-list'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('switch-list')).not.toBeInTheDocument())
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md')
  })

  test('轮换期间窗口失焦：兜底取消不切（Alt+Tab 切走丢 keyup）', async () => {
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    await screen.findByTestId('switch-list')
    fireEvent(window, new Event('blur'))
    await waitFor(() => expect(screen.queryByTestId('switch-list')).not.toBeInTheDocument())
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md')
  })

  test('轮换浮层点击：点当前项不切换，点其他项立即切换（鼠标路径）', async () => {
    await renderForSwitch()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    await screen.findByTestId('switch-list')
    fireEvent.click(screen.getAllByTestId('switch-item')[0]) // 列表 [a, b]：[0]=当前 a
    await waitFor(() => expect(screen.queryByTestId('switch-list')).not.toBeInTheDocument())
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md') // 同图 no-op（浮层关闭）
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true }) // 再呼
    fireEvent.click(screen.getAllByTestId('switch-item')[1]) // b：立即切换
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/b.md'))
  })
})

// ---- 顶部导图胶囊条（2026-09 鼠标流切换）：mapTabs 稳定序平铺、当前图高亮、点选走安全链 ----

describe('顶部导图胶囊条（2026-09）', () => {
  test('mapTabs ≥2 渲染平铺胶囊：当前图高亮，点选经安全链切换', async () => {
    useAppStore.setState({ mapTabs: ['/ws/a.md', '/ws/b.md', '/ws/子/c.md'] })
    await renderForSwitch()
    const items = screen.getAllByTestId('map-tab')
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveTextContent('b')
    expect(items[0]).toHaveAttribute('aria-current', 'page')
    fireEvent.click(items[1])
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/b.md'))
  })

  test('点击当前胶囊 no-op（仍在当前图）', async () => {
    useAppStore.setState({ mapTabs: ['/ws/a.md', '/ws/b.md'] })
    await renderForSwitch()
    fireEvent.click(screen.getAllByTestId('map-tab')[0])
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md')
  })

  test('仅当前一张不渲染整条（保持沉浸）', async () => {
    useAppStore.setState({ mapTabs: ['/ws/a.md'] })
    await renderForSwitch()
    expect(screen.queryByTestId('map-tabs')).not.toBeInTheDocument()
  })
})

// ── 打开失败优雅恢复（2026-09）：错误/加载态壳层保留——错误面板只占画布内容区，
// 对话框照常挂载（Ctrl+P/Ctrl+Tab 可用）、可返回案头；读失败自动移出最近清单 ──────
describe('打开失败优雅恢复（2026-09）', () => {
  /** 渲染指定路径的编辑器视图（打开失败用例共用） */
  const renderEditorAt = (mdPath: string) => {
    render(
      <EditorView
        mdPath={mdPath}
        openInEditor={openInEditor}
        writeClipboard={vi.fn(async () => {})}
        exportPorts={stubExportPorts}
        registerCloseGuard={noopRegister}
        pickImageFile={stubPickImage}
        readClipboardImage={stubReadClipboardImage}
        exitApp={noopExitApp}
      />,
    )
  }

  test('读失败：错误面板占画布并留出路，砚栏卸载（引擎未就绪其按钮无意义）', async () => {
    useAppStore.setState({
      recentOpened: ['/ws/missing.md', '/ws/b.md'],
      sessionRecent: ['/ws/missing.md', '/ws/b.md'],
    })
    renderEditorAt('/ws/missing.md')
    expect(await screen.findByText('无法打开此文件')).toBeInTheDocument()
    expect(screen.getByText('/ws/missing.md')).toBeInTheDocument()
    expect(screen.queryByTestId('zen-bar')).not.toBeInTheDocument()
    // Ctrl+P 浮层照常呼出（旧实现：浮层随早退卸载，按键被 anyDialogRef 闩死）
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(await screen.findByTestId('switch-input')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument())
    // 面板「返回案头」直接可达
    fireEvent.click(screen.getByTestId('btn-error-back'))
    await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
  })

  test('读失败：坏路径自动移出最近清单（recentOpened 持久化 + 会话 MRU）', async () => {
    useAppStore.setState({
      configPath: '/cfg.json',
      recentOpened: ['/ws/missing.md', '/ws/b.md'],
      sessionRecent: ['/ws/missing.md', '/ws/b.md'],
    })
    renderEditorAt('/ws/missing.md')
    expect(await screen.findByText('无法打开此文件')).toBeInTheDocument()
    await waitFor(() => expect(useAppStore.getState().recentOpened).toEqual(['/ws/b.md']))
    expect(useAppStore.getState().sessionRecent).toEqual(['/ws/b.md'])
    const cfg = JSON.parse(await fs.readTextFile('/cfg.json'))
    expect(cfg.recentOpened).toEqual(['/ws/b.md'])
  })

  test('解析失败：保留最近清单（文件仍在），Ctrl+P 与 Ctrl+Tab 均可用', async () => {
    await fs.writeTextFileAtomic('/ws/bad.md', '## 没有根\n')
    useAppStore.setState({
      recentOpened: ['/ws/bad.md', '/ws/b.md'],
      sessionRecent: ['/ws/bad.md', '/ws/b.md'],
    })
    renderEditorAt('/ws/bad.md')
    expect(await screen.findByText('无法打开此导图')).toBeInTheDocument()
    expect(useAppStore.getState().recentOpened).toContain('/ws/bad.md') // 不清理：修复后仍可达
    // Ctrl+P 搜索浮层
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(await screen.findByTestId('switch-input')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument())
    // Ctrl+Tab 轮换切到上一张（sessionRecent MRU：[bad, b]，首按高亮 b）
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    await screen.findByTestId('switch-list')
    fireEvent.keyUp(window, { key: 'Control' })
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/b.md'))
  })
})

// ── 外部变更冲突防护(多实例/外部编辑器改盘的保存前拦截) ──────────────────────
// 打开文档记磁盘原文基线,写盘前重读对比:被外部改写过 → 冲突三态框裁决,不再静默覆盖
describe('外部变更冲突防护', () => {
  const renderEditor = async () => {
    render(
      <EditorView
        mdPath="/ws/a.md"
        openInEditor={openInEditor}
        writeClipboard={vi.fn(async () => {})}
        exportPorts={stubExportPorts}
        registerCloseGuard={noopRegister}
        pickImageFile={stubPickImage}
        readClipboardImage={stubReadClipboardImage}
        exitApp={noopExitApp}
      />,
    )
    await screen.findByTestId('fake-canvas')
    ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  }

  test('外部改盘后保存：弹冲突框拦截且磁盘不被覆盖；选「覆盖磁盘版」后按内存写盘', async () => {
    await renderEditor()
    // 模拟另一实例/外部编辑器落盘
    await fs.writeTextFileAtomic('/ws/a.md', '# 外部版本\n')
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    await screen.findByTestId('dirty-badge')
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(await screen.findByTestId('conflict-dialog')).toBeInTheDocument()
    expect(await fs.readTextFile('/ws/a.md')).toBe('# 外部版本\n') // 拦截期未覆盖
    fireEvent.click(screen.getByTestId('conflict-overwrite'))
    await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
    expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
  })

  test('外部改盘后保存：选「以磁盘版为准」→ 不覆盖磁盘、清脏、递增重挂序号（重载）', async () => {
    await renderEditor()
    await fs.writeTextFileAtomic('/ws/a.md', '# 外部版本\n')
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    await screen.findByTestId('dirty-badge')
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await screen.findByTestId('conflict-dialog')
    fireEvent.click(screen.getByTestId('conflict-reload'))
    await waitFor(() => expect(useAppStore.getState().editorSeq).toBe(1))
    expect(await fs.readTextFile('/ws/a.md')).toBe('# 外部版本\n')
    expect(useAppStore.getState().dirty).toBe(false)
  })

  test('外部改盘后保存：选「取消」→ 不写盘、保脏、框收起', async () => {
    await renderEditor()
    await fs.writeTextFileAtomic('/ws/a.md', '# 外部版本\n')
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    await screen.findByTestId('dirty-badge')
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await screen.findByTestId('conflict-dialog')
    fireEvent.click(screen.getByTestId('conflict-cancel'))
    await waitFor(() => expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument())
    expect(useAppStore.getState().dirty).toBe(true)
    expect(await fs.readTextFile('/ws/a.md')).toBe('# 外部版本\n')
  })

  test('无外部改盘：保存不弹冲突框（基线接线后不得误报）', async () => {
    await renderEditor()
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    await screen.findByTestId('dirty-badge')
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(useAppStore.getState().dirty).toBe(false))
    expect(screen.queryByTestId('conflict-dialog')).not.toBeInTheDocument()
    expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n\n## 新分支\n')
  })
})

// 画布内新建导图（2026-09）：砚栏入口 → 复用案头 NewMapDialog → 确认走 leaveTo 安全链
// （暂停自动保存 → 显式保存 → 成功才 createAndOpen 跳转），与「返回案头/快速切换」同构
describe('画布内新建导图', () => {
  test('砚栏新建钮呼出新建对话框（名称+模板，复用案头组件），取消关框不创建', async () => {
    await renderForSwitch()
    fireEvent.click(screen.getByTestId('btn-new'))
    expect(screen.getByTestId('input-name')).toBeInTheDocument()
    fireEvent.click(screen.getByText('取消'))
    await waitFor(() => expect(screen.queryByTestId('input-name')).not.toBeInTheDocument())
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md')
    expect(await fs.exists('/ws/新图.md')).toBe(false)
  })

  test('确认新建：干净状态直接创建并跳转新图（文件落盘 + MRU 置顶）', async () => {
    await renderForSwitch()
    fireEvent.click(screen.getByTestId('btn-new'))
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(useAppStore.getState().currentMdPath).toBe('/ws/新图.md'))
    expect(useAppStore.getState().route).toBe('editor')
    expect(useAppStore.getState().sessionRecent[0]).toBe('/ws/新图.md')
    expect(await fs.readTextFile('/ws/新图.md')).toBe('# 新图\n')
  })

  test('确认新建：脏且保存失败 → 留在原图不创建（横幅提示，数据不丢）', async () => {
    fs.writeTextFileAtomic = vi.fn(async () => {
      throw new Error('磁盘占用')
    })
    await renderForSwitch()
    ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    ;(globalThis as unknown as Record<string, () => void>).__emitChange!()
    await screen.findByTestId('dirty-badge')
    fireEvent.click(screen.getByTestId('btn-new'))
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: '新图' } })
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(useAppStore.getState().error).toContain('保存失败'))
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md') // 未跳走
    expect(useAppStore.getState().dirty).toBe(true)
  })

  test('确认新建：重名 → 中文横幅提示且留在原图（创建失败不导航）', async () => {
    await renderForSwitch()
    fireEvent.click(screen.getByTestId('btn-new'))
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'a' } }) // /ws/a.md 已存在
    fireEvent.click(screen.getByTestId('btn-confirm'))
    await waitFor(() => expect(useAppStore.getState().error).toContain('已存在同名导图'))
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md')
  })
})
