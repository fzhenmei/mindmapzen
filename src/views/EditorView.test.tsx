import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, vi } from 'vitest'
import Vditor from 'vditor'
import EditorView from './EditorView'
import { useAppStore } from '../store/appStore'
import { useChatStore } from '../store/chatStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'
import { layoutToEngine } from '../editor/layoutMap'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { CopySettings } from '../types/files'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { CloseGuardEvent, RegisterCloseGuard } from '../types/ports'

// 引擎依赖真实 DOM 布局，组件测试用假画布
// fakeRootNode/fakeChildNode：renderer.findNodeByUid 返回的"节点实例"（稳定引用，供命令参数断言）；
// getData 正文预填用：child 带「既有正文」，root 无（undefined）。
// layerIndex（2026-09 正文 Task 6，Step 0 实测字段）：引擎节点深度 root=0 起
// （MindMapNode.js:52；mdTree 深度 = layerIndex+1）；fakeDeepNode 层级 6 = 深度 7（列表层）
const fakeRootNode = { uid: 'root-uid', layerIndex: 0, getData: () => undefined }
const fakeChildNode = {
  uid: 'child-uid',
  layerIndex: 1,
  getData: (k: string) => (k === 'body' ? '既有正文' : undefined),
}
// 深层列表节点（layerIndex 6 = mdTree 深度 7）：正文面板深层门禁的空态样本
const fakeDeepNode = { uid: 'deep-uid', layerIndex: 6, getData: () => undefined }

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
      onNoteHover,
      onEditorPaste,
      onNodeCopy,
      layout,
      registry,
    }: {
      onReady: (h: MindMapHandle) => void
      onDataChange: () => void
      onActiveChange?: (uids: string[]) => void
      onNoteHover?: (uid: string | null) => void
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
      // 节点标签：设标签入口（真实语义见 MindMapCanvas 装配的 execCommandTag）
      execCommandTag: vi.fn(),
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
        // 数据树挂 renderTree（引擎活树形态——getData 是深拷贝副本，expandToUid 直写
        // 须落活树；看板定位「展开收起祖先」用例依赖）
        renderTree: fakeTree,
        // 引擎 renderer.findNodeByUid（Render.js:2094）：uid → 节点实例，未命中 null
        findNodeByUid: (uid: string) =>
          uid === 'root-uid'
            ? fakeRootNode
            : uid === 'child-uid'
              ? fakeChildNode
              : uid === 'deep-uid'
                ? fakeDeepNode
                : null,
        textEdit: { show: vi.fn(), hideEditTextBox: vi.fn() },
        // 备注保存后的按需重渲（M5b 核验 13：裸 SET_NODE_DATA 不重渲染）
        reRenderNodeCheckChange: vi.fn(),
        // 节点居中（看板回导图定位 onLocate 的落点断言，引擎 Render.js:2008）
        moveNodeToCenter: vi.fn(),
        // 复制选中节点（对调后 Control+Shift+c 路径，EditorView 不经此，桩满足 EngineRenderer）
        copy: vi.fn(),
      },
    }
    ;(globalThis as unknown as Record<string, unknown>).__emitReady = () => onReady(fakeHandle)
    // v1.1 撤销/重做：向 back_forward 订阅者广播历史态（引擎 Command.js addHistory/back/forward 同款载荷）
    ;(globalThis as unknown as Record<string, unknown>).__emitHistory = (index: number, length: number) =>
      (listeners.get('back_forward') ?? []).forEach((cb) => cb(index, length))
    // 渲染完成事件镜像（看板定位用）：向 node_tree_render_end 订阅者广播
    ;(globalThis as unknown as Record<string, unknown>).__emitRenderEnd = () =>
      (listeners.get('node_tree_render_end') ?? []).forEach((cb) => cb())
    ;(globalThis as unknown as Record<string, unknown>).__emitChange = () => onDataChange()
    // 圈选多选镜像（2026-09）：桩对外仍收单 uid/null，转发时包装为 uid 数组（新契约，空数组 = 无选中）
    ;(globalThis as unknown as Record<string, unknown>).__emitActive = (uid: string | null) =>
      onActiveChange?.(uid ? [uid] : [])
    // 正文角标悬停上报镜像（2026-09-09 修复）：生产经 customNoteContentShow.show 第四参
    // （悬停节点实例）提取 uid，hide 清 null（真实链路见 MindMapCanvas 装配）
    ;(globalThis as unknown as Record<string, unknown>).__emitNoteHover = (uid: string | null) =>
      onNoteHover?.(uid)
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

// VDitor mock（2026-09-08 正文弹窗）：jsdom 无法 init CodeMirror，stub 构造+实例
// （vitest 4：箭头 mock 不可 new，function 实现构造恒返单例 inst——同 VditorEditor.test）。
// 取值/输入走构造参数断言：options.value 为载入初值，options.input 回调模拟编辑器输入
vi.mock('vditor', () => {
  const inst = { setValue: vi.fn(), insertValue: vi.fn(), destroy: vi.fn() }
  const Ctor = vi.fn(function () {
    return inst
  })
  return { default: Object.assign(Ctor, { preview: vi.fn().mockResolvedValue(undefined), __inst: inst }) }
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
    pendingLocate: null, // 工作台跨图定位（2026-09 spec §5）：消费型字段逐用例重置，防泄漏误定位
    viewMode: 'mindmap', // 案头 openTask 现写看板态（2026-09 跳看板）：逐用例重置防泄漏误挂看板浮层
    appDialog: null, // App 级设置/历史框（终审修复进 anyDialog 总线）：逐用例重置，防开框用例泄漏闩死后续快捷键
    settings: { copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false },
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

test('复制带图节点：图片相对路径转绝对 + 头部说明行（头注在剥正文之后，不被误剥）', async () => {
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
  // 图片转换在复制链尾段（树层剥正文与 md 层后处理之后）：头注引用行存活，src 拼 workspaceDir 前缀
  expect(writes[0]).toBe('> 图片为本地绝对路径，请用工具读取\n\n# 根\n\n## 配图 ![图注](/ws/assets/配图.png)\n')
})

// ---- 复制后处理（M5b Task 4：settings 两开关）----
// 样例树：child 带 note「备注」与文本双链 [[B]]（双链由 data 携带经 engineTreeToZen 还原；
// data.note 为宿主镜像(2026-09-06 备注合并)，engineTreeToZen 忽略不收——备注行不再进复制产物）
const noteLinkTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [{ data: { text: '见 [[B]]', expand: true, uid: 'child-uid', note: '备注' }, children: [] }],
})

const copyWith = async (settings: CopySettings, tree: EngineNode = noteLinkTree()): Promise<string> => {
  fakeTree = tree
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

test('复制后处理：默认设置含正文、留双链', async () => {
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false })).toBe('# 根\n\n## 见 [[B]]\n')
})

test('复制后处理：引擎镜像 data.note 不进复制产物（备注已并入正文，无独立备注层）', async () => {
  // 2026-09-06 备注合并:ZenNode.note 退役,engineTreeToZen 只收 data.body——
  // copyIncludeNote 设置键已随 Task 5 整链退役,任何设置组合下备注行都不再产出
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false })).toBe('# 根\n\n## 见 [[B]]\n')
})

test('复制后处理：copyIncludeLinks=false 时 [[B]] 剥括号留名', async () => {
  expect(await copyWith({ copyIncludeLinks: false, copyIncludeBody: true, copyIncludeIconStatus: false })).toBe('# 根\n\n## 见 B\n')
})

// ---- 复制含正文开关（2026-09 正文 Task 7）：树层剥除先于序列化 ----
// 样例树：child 带正文「既有正文」（data.body 经 engineTreeToZen 收进 ZenNode.body，
// serialize 输出节点行后的原样块）；正文块无行前缀标记，md 层按行剥不可行——剥在树层
const bodyTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [{ data: { text: '新分支', expand: true, uid: 'child-uid', body: '既有正文' }, children: [] }],
})

test('复制后处理：copyIncludeBody=false 时树层剥正文（管全部正文，含引用块部分）——md 含节点文本、不含正文段', async () => {
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: false, copyIncludeIconStatus: false }, bodyTree()))
    .toBe('# 根\n\n## 新分支\n')
})

test('复制后处理：copyIncludeBody=true（默认含，给 AI 改稿刚需）时正文段随节点行原样输出', async () => {
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false }, bodyTree()))
    .toBe('# 根\n\n## 新分支\n既有正文\n')
})

// 终审 C1 遗产：剥除只发生在树层，md 层零触碰——旧行级正则会误伤正文代码块内 `> ` 行
test('复制后处理：copyIncludeBody=true 不误伤正文代码块内 `> ` 行（默认组合即「复制给 AI 改稿」）', async () => {
  const tree: EngineNode = {
    data: { text: '根', expand: true, uid: 'root-uid' },
    children: [
      { data: { text: '新分支', expand: true, uid: 'child-uid', body: '```diff\n> 删除的行\n```', note: '备注' }, children: [] },
    ],
  }
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false }, tree))
    .toBe('# 根\n\n## 新分支\n```diff\n> 删除的行\n```\n')
})

// ---- 图标与看板状态剥除（2026-09 粘 AI 防干扰）：树层剥 icons/status 先于序列化 ----
// 样例树：child 带图标 ::flag、状态 @doing、标签 #采购（引擎形态：data.icon 内部保留名
// zen_status- 首项 + zen_ 前缀用户图标；data.tag 数组）
const iconStatusTree = (): EngineNode => ({
  data: { text: '根', expand: true, uid: 'root-uid' },
  children: [
    { data: { text: '任务A', expand: true, uid: 'child-uid', icon: ['zen_status-doing', 'zen_flag'], tag: ['采购'] }, children: [] },
  ],
})

test('复制后处理：默认（copyIncludeIconStatus=false）树层剥图标与看板状态——md 无 ::flag/@doing，#采购 保留（粘给 AI 干净）', async () => {
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: false }, iconStatusTree()))
    .toBe('# 根\n\n## 任务A #采购\n')
})

test('复制后处理：copyIncludeIconStatus=true 时 ::flag/@doing 随行尾注入（带标记粘贴场景，如粘回导图保留图标状态）', async () => {
  expect(await copyWith({ copyIncludeLinks: true, copyIncludeBody: true, copyIncludeIconStatus: true }, iconStatusTree()))
    .toBe('# 根\n\n## 任务A #采购 ::flag @doing\n')
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

test('复制序列化抛错（节点文本含换行）→ 错误横幅可见而非静默（2026-09-07 release 回归）', async () => {
  // 实案复刻：从外部粘贴的节点文本携带隐藏换行（\n/\r 随节点移动，任何层级都炸）——
  // serialize assertNoNewline 抛错。此前 doCopy 同步段无兜底：异常沿 React 合成事件吞掉，
  // 无印记无横幅（无声失败）
  fakeTree = {
    data: { text: '根', expand: true, uid: 'root-uid' },
    children: [{ data: { text: 'SpringBoot Actuator\r未授权访问漏洞', expand: true, uid: 'poison-uid' }, children: [] }],
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
  fireEvent.click(screen.getByTestId('btn-copy'))
  await act(async () => {})
  // 修复目标：错误可见（含定位信息），而不是无任何反馈
  expect(useAppStore.getState().error).toMatch(/复制失败.*换行.*SpringBoot/)
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
 *  独立路径 /ws/ignored.md，避免与 beforeEach 的 /ws/a.md 内容互相干扰。
 *  段落置于根 H1 之前——正文功能（2026-09）后标题下的段落收进 body 不再进 ignoredBlocks，
 *  根前块无归属仍进 ignored（触发载体换了位置，忽略流/横幅断言语义不变） */
const renderIgnoredMap = async (guard?: ReturnType<typeof makeGuardStub>) => {
  const exitApp = vi.fn()
  await fs.writeTextFileAtomic('/ws/ignored.md', '一段说明。\n\n# 根\n\n## A\n')
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
  // 锁定 emit 时实例断言（onCanvasReady 置 engineReady 会重渲、工厂每渲重建 fakeHandle）
  const handle = fakeHandle
  fireEvent.click(screen.getByTestId('btn-zoom-out'))
  expect(handle.view.narrow).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('btn-zoom-in'))
  expect(handle.view.enlarge).toHaveBeenCalledTimes(1)
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

  // AI 回合锁（Task 12 fix，spec §6 禁切导图）：快速切换全拦——Ctrl+P/Ctrl+Tab 呼不出
  // 浮层（open/cycleStep 入口即拦，commit 路径自然封死）；浮层开着进入回合时回车 commit
  // （onPick）也不 openMap；拦截以 blockedPulse 脉冲提示。回合中切图会卸载 EditorView，
  // 异步回合循环写旧 mm 引用（孤儿回合），故键盘三条通路与鼠标路径同口径
  test('AI 回合中快速切换全拦：浮层呼不出、开着也 commit 不动，脉冲提示', async () => {
    await renderForSwitch()
    useChatStore.getState().setPhase('streaming')
    // 呼出通路：Ctrl+P 搜索浮层 / Ctrl+Tab 轮换浮层均不开
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    expect(screen.queryByTestId('switch-list')).not.toBeInTheDocument()
    expect(useChatStore.getState().blockedPulse).toBe(true) // notifyBlocked 生效（状态签脉冲）
    // commit 通路：idle 下呼出浮层后进入回合，回车选择（onPick）不切图
    useChatStore.getState().setPhase('idle')
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    expect(screen.getByTestId('switch-input')).toBeInTheDocument()
    useChatStore.getState().setPhase('streaming')
    fireEvent.keyDown(screen.getByTestId('switch-input'), { key: 'Enter' })
    expect(useAppStore.getState().currentMdPath).toBe('/ws/a.md') // quick.switchTo 被拦，未 openMap
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

// ── 正文弹窗（2026-09-08 弹窗化 + VDitor）：btn-body 开关、模态锁节点（开着时引擎选中
//    变化不冲刷不重载）、防抖写回、深层列表空态；编辑区为 VDitor（jsdom mock 构造，
//    options.value 断言载入初值、options.input 回调模拟输入；testid body-dialog /
//    body-editor=编辑区包裹 / body-empty / body-wordcount）──

/** 渲染并就绪后选中 child-uid：ready 在前、active 在后——useNodeActions 的锚点 effect
 *  须在 mmRef 就位后由 activeUid 变化触发（NodeActions 浮条才渲染，图标用例依赖）。
 *  返回 ready 时刻锁定的实例：假画布工厂每次重渲重赋模块级 fakeHandle，而 mmRef 只在
 *  ready 时接收一次——须在 emitReady 后立即捕获（同 renderReady 的同源约定） */
const renderReadySelected = async (): Promise<MindMapHandle> => {
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
  const handle = fakeHandle
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('child-uid')
  })
  return handle
}

test('body-dialog：宽度不被默认 sm:max-w-lg 钳制——覆盖类须用 sm:max-w-none 同断点压掉（2026-09-09 修复契约）', async () => {
  // 坑：DialogContent 默认类带 sm:max-w-lg（512px）；裸 max-w-none 与它不同 modifier，
  // twMerge 不清、Tailwind 源序 sm: 变体在后反胜 → w-[…] 全被钳住（改 w- 类看似无效）。
  // 须用同断点 sm:max-w-none 才能压掉；此断言防将来被"简化"回裸 max-w-none。
  await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  expect(screen.getByTestId('body-dialog')).toHaveClass('sm:max-w-none')
  expect(screen.getByTestId('body-dialog')).not.toHaveClass('sm:max-w-lg')
})

test('btn-body：开弹窗载入选中节点 body；VDitor input 防抖后 SET_NODE_DATA 成对写 body＋镜像 note 并补重渲', async () => {
  const handle = await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  expect(screen.getByTestId('body-dialog')).toBeVisible()
  expect(screen.getByTestId('btn-body')).toHaveAttribute('data-active', '') // 激活态走 data-active 通道
  // 初值经构造 options.value 载入（替代原 textarea.value 断言）：预填节点实例 getData('body')
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.at(-1)![1].value).toBe('既有正文')
  expect(screen.getByTestId('body-wordcount')).toHaveTextContent('4') // 中文字符口径（去空白码点数）
  // input 回调 → 500ms 防抖内不写；快进后提交（body 与镜像 note 同一命令成对落下＝
  // 单条撤销记录；引擎「有 note→挂角标+悬停」由镜像驱动，reRenderNodeCheckChange 使其即时增删）
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    })
    expect(handle.execCommand).not.toHaveBeenCalled()
    expect(screen.getByTestId('body-wordcount')).toHaveTextContent('5')
    await act(async () => {
      vi.advanceTimersByTimeAsync?.(600)
    })
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: '既有正文！',
      note: '既有正文！', // 镜像 note 成对写（2026-09-06 合并）：角标/悬停由它驱动
    })
    expect(handle.renderer?.reRenderNodeCheckChange).toHaveBeenCalledWith(fakeChildNode)
    // 关弹窗即 flush 已由上面提交清空（pending 无）→ 仅关闭，弹窗卸载
    fireEvent.click(screen.getByTestId('body-close'))
    expect(screen.queryByTestId('body-dialog')).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('btn-body：清空草稿提交时 body 与镜像 note 成对置 undefined（角标随镜像消失）', async () => {
  const handle = await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    }) // 先编辑为「既有正文！」
    await act(async () => {
      input('')
    }) // 再清空（与引擎值「既有正文」不同，必提交）
    await act(async () => {
      vi.advanceTimersByTimeAsync?.(600)
    })
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: undefined, // 清空成对置 undefined（2026-09-06 合并）：引擎按 truthy 判定，角标随镜像消失
      note: undefined,
    })
  } finally {
    vi.useRealTimers()
  }
})

test('弹窗模态锁节点：开着时引擎选中变化不冲刷不重载；深层列表节点（layerIndex≥6）弹窗空态不可编辑', async () => {
  // 数据树补 deep-uid 节点（弹窗标题经 nodeTextOf 按 uid 查数据树；深层门禁读实例 layerIndex）
  fakeTree = {
    data: { text: '根', expand: true, uid: 'root-uid' },
    children: [
      { data: { text: '新分支', expand: true, uid: 'child-uid' }, children: [] },
      { data: { text: '深层', expand: true, uid: 'deep-uid' }, children: [] },
    ],
  }
  const handle = await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    }) // 草稿在防抖窗内未提交
    // 2026-09-08 弹窗化（模态无联动载入链）：开着时切选中不冲刷（命令仍零）、
    // 不重载（无新 Vditor 构造，草稿与字数原样）——编辑对象是打开时锁定的节点
    const callsBefore = calls.length
    act(() => {
      ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('root-uid')
    })
    expect(handle.execCommand).not.toHaveBeenCalled()
    expect(calls.length).toBe(callsBefore)
    expect(screen.getByTestId('body-wordcount')).toHaveTextContent('5')
    // 关闭即结束：对打开时锁定的 child 提交
    fireEvent.click(screen.getByTestId('body-close'))
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: '既有正文！',
      note: '既有正文！', // 镜像 note 成对写（2026-09-06 合并）：角标/悬停由它驱动
    })
    // 深层节点（layerIndex 6 = mdTree 深度 7 列表层，spec v1 深度限制）：打开即空态，不渲染编辑器
    act(() => {
      ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('deep-uid')
    })
    fireEvent.click(screen.getByTestId('btn-body'))
    expect(screen.getByText('深层列表节点暂不支持正文')).toBeInTheDocument()
    expect(screen.queryByTestId('vditor-host')).not.toBeInTheDocument()
    expect(calls.length).toBe(callsBefore) // 空态不构造编辑器
  } finally {
    vi.useRealTimers()
  }
})

test('btn-body：无选中盖警告签不开空态弹窗（1.2s 受控卸载）；弹窗进互斥总线（开着时 Ctrl+P 浮层不再触发）', async () => {
  const handle = await renderReadySelected()
  // 互斥半场（有选中）：弹窗开 → 其他浮层快捷键让位（2026-09-08 弹窗化进 anyDialog 总线）
  fireEvent.click(screen.getByTestId('btn-body'))
  expect(screen.getByTestId('body-dialog')).toBeVisible()
  fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
  await act(async () => {})
  expect(screen.queryByTestId('switch-input')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('body-close'))
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(null) // 无选中
  })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    fireEvent.click(screen.getByTestId('btn-body'))
    await act(async () => {})
    expect(screen.queryByTestId('body-dialog')).not.toBeInTheDocument() // 不再弹无关联空态弹窗
    expect(screen.getByTestId('warn-stamp')).toBeInTheDocument() // 警告签（复制印记同款短窗）
    expect(handle.execCommand).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1300)
    })
    expect(screen.queryByTestId('warn-stamp')).not.toBeInTheDocument() // 到期已受控卸载
  } finally {
    vi.useRealTimers()
  }
})

test('关弹窗即 flush 未提交草稿（close 分支），计时器清空不二次提交', async () => {
  const handle = await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    }) // 草稿在防抖窗内
    fireEvent.click(screen.getByTestId('body-close')) // 关弹窗 → 立即冲刷
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: '既有正文！',
      note: '既有正文！', // 镜像 note 成对写（2026-09-06 合并）：角标/悬停由它驱动
    })
    expect(screen.queryByTestId('body-dialog')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(600) // 计时器已随 flush 清空，不再产生第二条命令
    })
    expect(handle.execCommand).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})

test('窗口失焦即 flush 防抖中的草稿（blur 分支）', async () => {
  const handle = await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    })
    fireEvent(window, new Event('blur')) // 切窗口 → 防抖草稿立即落引擎
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: '既有正文！',
      note: '既有正文！', // 镜像 note 成对写（2026-09-06 合并）：角标/悬停由它驱动
    })
  } finally {
    vi.useRealTimers()
  }
})

test('Ctrl+S 显式保存先冲刷正文防抖草稿（审查 I-2：落盘 md 不缺尾部输入）', async () => {
  const handle = await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    }) // 尾部输入悬在 500ms 窗内
    fireEvent.keyDown(window, { key: 's', ctrlKey: true }) // explicitSave 开头 flushNow
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: '既有正文！',
      note: '既有正文！', // 镜像 note 成对写（2026-09-06 合并）：角标/悬停由它驱动
    })
    await act(async () => {}) // 排空保存链微任务（数据树为 mock，不真落 body——只锁「保存前冲刷」时序）
  } finally {
    vi.useRealTimers()
  }
})

test('关闭守卫先冲防抖窗内草稿再走三态（终审 I2：干净图关窗不丢尾部输入）', async () => {
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
  ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
  const handle = fakeHandle // ready 时刻锁定实例（工厂每次重渲重赋模块级 fakeHandle，同 renderReadySelected 约定）
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!('child-uid')
  })
  fireEvent.click(screen.getByTestId('btn-body'))
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  const input = calls.at(-1)![1].input as (md: string) => void
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await act(async () => {
      input('既有正文！')
    }) // 防抖窗内未提交：SET_NODE_DATA 未发生、dirty 仍 false
    expect(guard.fireClose()).toBe(true) // 拦截：hasPending 强制三态，不依赖（未及翻转的）dirtyRef
    expect(handle.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fakeChildNode, {
      body: '既有正文！',
      note: '既有正文！', // 镜像 note 成对写（2026-09-06 合并）：角标/悬停由它驱动
    })
    expect(screen.getByTestId('closeguard-save')).toBeInTheDocument() // 三态对话框弹出（保存/放弃/取消）
    expect(exitApp).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

// ── 图标管理器（2026-09-06 zen_body 退役）：SET_NODE_ICON 整组覆写，落下数组即用户
//    所选纯用户图标——不再按 data.body 重补内部保留名，「有正文」角标由镜像 note 承担 ──

/** 给 fakeChildNode 临时挂几何（NodeActions 浮条锚点需要）并返回还原函数 */
const withGeometry = (): (() => void) => {
  const geo = { left: 10, top: 20, width: 60, height: 24 }
  Object.assign(fakeChildNode, geo)
  return () => {
    for (const k of Object.keys(geo)) delete (fakeChildNode as Record<string, unknown>)[k]
  }
}

test('图标管理器：有正文节点确认落下数组即纯用户图标（不掺内部名，角标走镜像 note）', async () => {
  fakeTree.children![0]!.data.body = '既有正文'
  const restore = withGeometry()
  try {
    const handle = await renderReadySelected()
    fireEvent.click(screen.getByTestId('node-action-icon'))
    expect(screen.getByTestId('icon-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('icon-item-flag')) // 精选网格点选一项
    fireEvent.click(screen.getByTestId('icon-save'))
    // 生产链路：execCommandIcon → node.setIcon → SET_NODE_ICON；断言落下的数组不含 zen_body
    expect(handle.execCommandIcon).toHaveBeenCalledWith('child-uid', ['zen_flag'])
  } finally {
    restore()
  }
})

// ── 标签选择器（feature/node-tags）：浮条钮 → 对话框 → SET_NODE_TAG 整组覆写链路 ──

test('标签选择器：已选/已用来自整树 data.tag，确认走 execCommandTag 整组覆写', async () => {
  // 预置当前节点已有标签 urgent（链路：nodeTagsOf/usedTagsOf → getData → data.tag）
  fakeTree.children![0]!.data.tag = ['urgent']
  const restore = withGeometry()
  try {
    const handle = await renderReadySelected()
    fireEvent.click(screen.getByTestId('node-action-tag'))
    expect(screen.getByTestId('tag-dialog')).toBeInTheDocument()
    // 当前节点标签进已选 chips；同树收集的已用标签列表在场
    expect(screen.getByTestId('tag-chip-urgent')).toBeInTheDocument()
    expect(screen.getByTestId('tag-used-urgent')).toBeInTheDocument()
    // 输入新建 + 确认：整组覆写 = 既有 + 新增
    fireEvent.change(screen.getByTestId('tag-input'), { target: { value: '采购' } })
    fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' })
    fireEvent.click(screen.getByTestId('tag-save'))
    // 生产链路：execCommandTag → node.setTag → SET_NODE_TAG
    expect(handle.execCommandTag).toHaveBeenCalledWith('child-uid', ['urgent', '采购'])
  } finally {
    delete fakeTree.children![0]!.data.tag
    restore()
  }
})

// ── 状态选择器（2026-09 看板模式 Task 8）：浮条状态钮 → 对话框 → setIcon 徽章互保链路 ──

test('状态选择器：浮条钮开框载入现态，确认经渲染节点 setIcon 落徽章互保', async () => {
  // 预置当前节点带状态徽章 + 用户图标（nodeStatusOf 读现态 / currentIcon 合成均走数据树 data.icon）
  fakeTree.children![0]!.data.icon = ['zen_status-doing', 'zen_flag']
  // fakeChildNode 临时挂 setIcon（渲染节点命令落点；实写数据树，替身语义同 KanbanView 测试）
  const setIcon = vi.fn((icons: string[]) => {
    fakeTree.children![0]!.data.icon = icons
  })
  Object.assign(fakeChildNode, { setIcon })
  const restore = withGeometry()
  try {
    await renderReadySelected()
    const btn = screen.getByTestId('node-action-status')
    expect(btn).toHaveAttribute('aria-label', '节点状态')
    fireEvent.click(btn)
    expect(screen.getByTestId('status-dialog')).toBeInTheDocument()
    // 开框载入现态：doing 高亮（快照来自 nodeStatusOf）
    expect(screen.getByTestId('status-option-doing')).toHaveClass('ring-2')
    // 选 done 确认：生产链路 execOnRenderNode → node.setIcon（SET_NODE_ICON 单命令可撤销）→
    // 徽章互保（新徽章置首、旧徽章滤除、用户图标 zen_flag 保留）
    fireEvent.click(screen.getByTestId('status-option-done'))
    fireEvent.click(screen.getByTestId('status-save'))
    expect(setIcon).toHaveBeenCalledWith(['zen_status-done', 'zen_flag'])
  } finally {
    delete fakeTree.children![0]!.data.icon
    delete (fakeChildNode as { setIcon?: unknown }).setIcon
    restore()
  }
})

// ── 入口合并（2026-09-06 备注合并）：浮条/快捷键改指正文弹窗；btn-note/note-dialog 退役 ──

test('浮条 node-action-body 开正文弹窗（aria-label 指正文）；btn-note 不复存在', async () => {
  const restore = withGeometry() // NodeActions 锚点需节点几何（同图标用例的挂几何模式）
  try {
    const handle = await renderReadySelected()
    expect(screen.queryByTestId('btn-note')).not.toBeInTheDocument() // 入口合并：砚栏备注钮退役
    const btn = screen.getByTestId('node-action-body')
    expect(btn).toHaveAttribute('aria-label', '编写选中节点的正文')
    fireEvent.click(btn)
    expect(screen.getByTestId('body-dialog')).toBeVisible()
    const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.at(-1)![1].value).toBe('既有正文')
    expect(handle.execCommand).not.toHaveBeenCalled() // 只开关未编辑，无命令
  } finally {
    restore()
  }
})

test('Shift+F2 开、Esc 关正文弹窗（toggle/关闭语义）；note-dialog 不复存在', async () => {
  await renderReadySelected()
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  expect(screen.getByTestId('body-dialog')).toBeVisible()
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.at(-1)![1].value).toBe('既有正文')
  expect(screen.queryByTestId('note-dialog')).not.toBeInTheDocument() // 备注对话框退役
  fireEvent.keyDown(document, { key: 'Escape' }) // radix Dialog Esc → onOpenChange(false) 关闭
  expect(screen.queryByTestId('body-dialog')).not.toBeInTheDocument()
})

test('Shift+F2 互斥守卫：任一对话框在开时不再开正文弹窗（anyDialog 总线）', async () => {
  await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-export'))
  expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  await act(async () => {})
  expect(screen.queryByTestId('body-dialog')).not.toBeInTheDocument()
  expect(screen.getByTestId('export-dialog')).toBeInTheDocument() // 原对话框不受扰
})

// ── Shift+F2 悬停优先（2026-09-09 修复）：悬停预览页脚「Shift+F2」承诺编辑的是被预览节点 ──
// 根因：热键走选中（activeUidRef），悬停不产生选中——无选中出无关联空态；选着别的节点
// 则编辑错节点。修复：引擎 customNoteContentShow.show 第四参（悬停节点实例）提取 uid
// 上报，热键路径悬停优先、退场回落选中

test('Shift+F2 悬停优先：无选中但悬停预览在场 → 弹窗关联悬停节点（不出无选中空态）', async () => {
  await renderReadySelected()
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(null) // 无选中
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitNoteHover!('child-uid') // 悬停预览在场
  })
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  expect(screen.getByTestId('body-dialog')).toBeVisible()
  expect(screen.queryByTestId('body-empty')).not.toBeInTheDocument() // 修复前：无关联空态
  const calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.at(-1)![1].value).toBe('既有正文') // 载入悬停节点 body
})

test('Shift+F2 悬停优先/退场回落：悬停盖过选中，hide 后热键回到选中节点', async () => {
  await renderReadySelected() // 选中 child-uid
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitNoteHover!('root-uid') // 悬停另一节点
  })
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  expect(screen.getByTestId('body-dialog')).toBeVisible()
  let calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.at(-1)![1].value).toBe('') // 悬停优先：root 无正文载空串（非选中的 child）
  fireEvent.keyDown(document, { key: 'Escape' }) // 关弹窗
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitNoteHover!(null) // 悬停退场
  })
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  calls = (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.at(-1)![1].value).toBe('既有正文') // 回落选中节点
})

test('Shift+F2 无目标（悬停/选中皆空）→ 盖警告签不开弹窗；有目标不盖（悬停优先用例互证）', async () => {
  const handle = await renderReadySelected()
  act(() => {
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitActive!(null)
    ;(globalThis as unknown as Record<string, (uid: string | null) => void>).__emitNoteHover!(null)
  })
  fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
  expect(screen.queryByTestId('body-dialog')).not.toBeInTheDocument() // 不弹无关联空态弹窗
  expect(screen.getByTestId('warn-stamp')).toBeInTheDocument() // 警告签劝导（2026-09-09 无目标反馈）
  expect(handle.execCommand).not.toHaveBeenCalled()
})

// ── 正文插图（2026-09 与节点插图同口径）：粘贴/拖入图片经 vditor upload.handler 落盘
//    assets/ 插相对路径引用（替换 vditor 无 upload 配置时的 base64 兜底——data: 串直插
//    md 毒化保存链）；分屏预览 parse 回调把相对 src 换 dataURL（webview 解析不了相对路径）──

/** 最近一次 vditor 构造 options（正文弹窗开着时 = 弹窗内 VditorEditor 实例） */
const lastVditorOpts = (): Record<string, unknown> =>
  (Vditor as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1] as Record<string, unknown>

test('正文插图：粘贴图片经 handler 落盘 assets/ 并插入相对路径引用（BodyDialog 透传链）', async () => {
  await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const handler = (lastVditorOpts().upload as { handler: (f: File[]) => Promise<string | null> }).handler
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], '贴图.png', { type: 'image/png' })
  await expect(handler([file])).resolves.toBeNull()
  // 落盘与节点插图同口径：防撞名复制入 assets/，md 引用相对路径
  expect([...(await fs.readBytes('/ws/assets/贴图.png'))]).toEqual([0x89, 0x50, 0x4e, 0x47])
  const inst = (Vditor as unknown as { __inst: { insertValue: ReturnType<typeof vi.fn> } }).__inst
  expect(inst.insertValue).toHaveBeenCalledWith('![贴图](assets/贴图.png)\n')
})

test('正文插图：无工作区/落盘失败返回错误词条（显式出口），不插入', async () => {
  await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  act(() => {
    useAppStore.setState({ workspaceDir: null })
  })
  const handler = (lastVditorOpts().upload as { handler: (f: File[]) => Promise<string | null> }).handler
  const inst = (Vditor as unknown as { __inst: { insertValue: ReturnType<typeof vi.fn> } }).__inst
  inst.insertValue.mockClear() // 模块级单例 mock：上一用例的成功插入计数残留
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], '贴图.png', { type: 'image/png' })
  await expect(handler([file])).resolves.toBe('图片保存失败')
  expect(inst.insertValue).not.toHaveBeenCalled()
})

test('正文预览：parse 回调把相对路径 img 换 dataURL（读盘经 buildImageMetaFromSrcs）', async () => {
  await fs.writeBytes('/ws/assets/预览.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  await renderReadySelected()
  fireEvent.click(screen.getByTestId('btn-body'))
  const parse = lastVditorOpts().preview as { parse: (el: HTMLElement) => void }
  const el = document.createElement('div')
  const img = document.createElement('img')
  img.src = 'assets/预览.png'
  el.append(img)
  parse.parse(el)
  await waitFor(() => expect(img.src).toBe(pngDataUrl))
})

// ── AI 对话面板挂载（2026-09 AI Agent v1 Task 11）：入口显隐（未配置隐藏）、面板开合、
//    选中节点上行 chatStore.contextNode、卸载 reset 会话内存态（切图经 App key 重挂同点）──
describe('AI 对话面板挂载（2026-09 AI Agent v1）', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
    useAppStore.setState({ aiChatWidth: null })
  })

  const renderEditor = () =>
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

  test('未配置：入口隐藏；配置后：入口可见，点击开面板，面板关闭钮收起回入口', async () => {
    useAppStore.setState({ aiConfig: { baseUrl: '', apiKey: '', model: '' } } as never)
    renderEditor()
    expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-toggle')).not.toBeInTheDocument()
    cleanup()
    useAppStore.setState({ aiConfig: { baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' } } as never)
    renderEditor()
    fireEvent.click(await screen.findByTestId('ai-toggle'))
    expect(screen.getByTestId('ai-panel')).toBeInTheDocument() // 面板开
    expect(screen.queryByTestId('ai-toggle')).not.toBeInTheDocument() // 入口让位
    fireEvent.click(screen.getByTestId('ai-close'))
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument() // 面板关
    expect(screen.getByTestId('ai-toggle')).toBeInTheDocument() // 入口回归
  })

  test('选中节点上行 contextNode：单选写 uid/文本，清选置空', async () => {
    useAppStore.setState({ aiConfig: { baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' } } as never)
    renderEditor()
    expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
    act(() => {
      ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    })
    act(() => {
      ;(globalThis as unknown as { __emitActive: (uid: string | null) => void }).__emitActive('child-uid')
    })
    expect(useChatStore.getState().contextNode).toEqual({ uid: 'child-uid', text: '新分支' })
    act(() => {
      ;(globalThis as unknown as { __emitActive: (uid: string | null) => void }).__emitActive(null)
    })
    expect(useChatStore.getState().contextNode).toBeNull()
  })

  test('卸载清空 AI 会话内存态（切图/关闭同点覆盖）', async () => {
    renderEditor()
    expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
    act(() => {
      useChatStore.getState().pushUser('历史消息')
    })
    cleanup()
    expect(useChatStore.getState().messages).toEqual([])
  })

  test('面板开合触发画布补偿 resize；容器 0×0 时被门禁跳过（webview2 污染链路复刻）', async () => {
    useAppStore.setState({ aiConfig: { baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' } } as never)
    const el = document.createElement('div')
    let rect = { width: 400, height: 300 } as DOMRect
    el.getBoundingClientRect = () => rect
    renderEditor()
    expect(await screen.findByTestId('fake-canvas')).toBeInTheDocument()
    // 锁定 emit 时实例断言（onCanvasReady 置 engineReady 会重渲、工厂每渲重建 fakeHandle）：
    // el 注入与 resize 断言必须同实例——mmRef 只收 emit 时实例，重渲后的模块级变量已换新
    const handle = fakeHandle
    act(() => {
      ;(handle as { el: HTMLElement | null }).el = el
      ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    })
    const resize = vi.mocked(handle.resize)
    fireEvent.click(screen.getByTestId('ai-toggle'))
    expect(resize).toHaveBeenCalled() // 正常 rect：开面板即补偿一次
    resize.mockClear()
    rect = { width: 0, height: 0 } as DOMRect // 窄窗口下面板挤压画布至 0×0
    fireEvent.click(screen.getByTestId('ai-close'))
    expect(resize).not.toHaveBeenCalled() // 门禁跳过，不触引擎"先污染后抛错"链路
  })
})

// ── 看板模式（2026-09 Task 7）：viewMode 浮层挂载（不卸载引擎画布）+ ZenBar/快捷键
//    切换 + 回导图展开居中定位 + picker 显式 uid 桥接 ──────────────────────────────

/** 看板样例树：child 带 zen_status-todo 徽章（engineTreeToZen 映射 status → 进板成卡片） */
const kanbanTree = (rootExpand = true): EngineNode => ({
  data: { text: '根', expand: rootExpand, uid: 'root-uid' },
  children: [{ data: { text: '任务', expand: true, uid: 'child-uid', icon: ['zen_status-todo'] }, children: [] }],
})

describe('看板模式（2026-09 Task 7）', () => {
  beforeEach(() => {
    useAppStore.setState({ viewMode: 'mindmap' })
  })

  /** 渲染 → ready → 切看板；返回 ready 时刻锁定实例（后续重渲工厂重赋 fakeHandle，
   *  mmRef 只在 ready 收一次——同 renderReadySelected 的同源约定） */
  const renderKanbanReady = async (tree?: EngineNode): Promise<MindMapHandle> => {
    if (tree !== undefined) fakeTree = tree
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
    const handle = fakeHandle
    act(() => {
      useAppStore.getState().setViewMode('kanban')
    })
    expect(await screen.findByTestId('kanban-view')).toBeInTheDocument()
    return handle
  }

  test('viewMode=kanban：看板浮层在场且引擎画布不卸载；切回导图浮层卸载', async () => {
    await renderKanbanReady(kanbanTree())
    expect(screen.getByTestId('fake-canvas')).toBeInTheDocument() // 画布未卸载（浮层不卸引擎策略）
    expect(screen.getByTestId('btn-view-kanban')).toHaveAttribute('data-state', 'on') // 砚栏视图组点亮
    act(() => {
      useAppStore.getState().setViewMode('mindmap')
    })
    expect(screen.queryByTestId('kanban-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-canvas')).toBeInTheDocument() // 切回画布仍在（从未卸载）
  })

  test('Ctrl+1/2/3 直达视图；对话框开着也直达（视图切换不进 anyDialog 互斥）', async () => {
    // 2026-09 画布三态 M1：导出钮改导图态专属（ZenBar 三态矩阵，看板态不显）——
    // 「对话框开着也切」语义自导图态起：先开导出框再 Ctrl+3 进看板、Ctrl+1 切回，
    // 对话框全程在场（视图直达不关对话框、也不被 anyDialog 互斥拦）
    fakeTree = kanbanTree()
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
    fireEvent.click(screen.getByTestId('btn-export'))
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '3', ctrlKey: true })
    await waitFor(() => expect(useAppStore.getState().viewMode).toBe('kanban'))
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument() // 切看板：对话框不关
    fireEvent.keyDown(window, { key: '1', ctrlKey: true })
    await waitFor(() => expect(useAppStore.getState().viewMode).toBe('mindmap'))
    expect(screen.queryByTestId('kanban-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument() // 原对话框不受扰
  })

  test('数字键直达输入域守卫：过滤框/正文输入中不切视图（防丢草稿），非输入域照切', async () => {
    await renderKanbanReady(kanbanTree())
    // 2026-09-13 终审遗留修复：正文面板/AI 输入框/看板列底与过滤输入中触发会切视图丢草稿——
    // 焦点在 input/textarea/contenteditable 时放行不截获（守卫同 Ctrl+C 输入域模式）
    const filter = screen.getByTestId('kanban-filter')
    fireEvent.change(filter, { target: { value: '进行中' } })
    fireEvent.keyDown(filter, { key: '1', ctrlKey: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(useAppStore.getState().viewMode).toBe('kanban') // 未切——草稿（过滤词）保全
    // 非输入域（window 直发）照常切换：守卫不得误伤正常出路
    fireEvent.keyDown(window, { key: '1', ctrlKey: true })
    await waitFor(() => expect(useAppStore.getState().viewMode).toBe('mindmap'))
  })

  test('看板卡片菜单「节点图标」桥接 picker：显式卡片 uid 落命令（Task 6 审查预警 A 回归钉）', async () => {
    // 画布无选中（selection.activeUidRef=null）：若桥接缺显式 uid，apply 将取 null 直接丢弃
    const handle = await renderKanbanReady(kanbanTree())
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-child-uid'), { button: 0 })
    fireEvent.click(await screen.findByText('节点图标'))
    expect(screen.getByTestId('icon-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('icon-item-flag'))
    fireEvent.click(screen.getByTestId('icon-save'))
    // 命令落卡片节点（child-uid）且徽章互保（zen_status-todo 置首）
    expect(handle.execCommandIcon).toHaveBeenCalledWith('child-uid', ['zen_status-todo', 'zen_flag'])
  })

  test('卡片菜单「回导图定位」：切视图 + 展开收起祖先 + 渲染完成回调后居中（2026-09 验收变更：定位自单击移入菜单）', async () => {
    // 根收起（expand=false）：定位须先沿数据树展开（渲染树寻址前置），再等渲染完成居中
    const handle = await renderKanbanReady(kanbanTree(false))
    expect(fakeTree.data.expand).toBe(false)
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-child-uid'), { button: 0 })
    fireEvent.click(await screen.findByTestId('kanban-locate-child-uid'))
    await waitFor(() => expect(useAppStore.getState().viewMode).toBe('mindmap'), { timeout: 2000 })
    expect(screen.queryByTestId('kanban-view')).not.toBeInTheDocument()
    expect(fakeTree.data.expand).toBe(true) // 祖先直写展开（视图导航豁免，不进 undo）
    const center = handle.renderer?.moveNodeToCenter as ReturnType<typeof vi.fn>
    expect(center).not.toHaveBeenCalled() // 展开重渲完成前不居中（等渲染树重建后寻址）
    // 渲染完成事件（引擎 node_tree_render_end）后在新渲染树上寻址居中
    act(() => {
      ;(globalThis as unknown as Record<string, () => void>).__emitRenderEnd!()
    })
    expect(center).toHaveBeenCalledWith(fakeChildNode)
  })

  test('看板卡片复制（2026-09 子树卡片）：菜单复制该卡追踪范围的子树 md，嵌套状态截断不入', async () => {
    // 树：根 > 任务A(doing) > [子任务B(todo) > B1, 说明C]——A 卡复制截断在 B（B 是独立
    // 卡片），md 只含 A + 说明C；对齐 doCopy 同源管线（settings/印记全沿用）
    const writes: string[] = []
    fakeTree = {
      data: { text: '根', expand: true, uid: 'root-uid' },
      children: [{
        data: { text: '任务A', expand: true, uid: 'a-uid', icon: ['zen_status-doing'] },
        children: [
          { data: { text: '子任务B', expand: true, uid: 'b-uid', icon: ['zen_status-todo'] }, children: [
            { data: { text: 'B1', expand: true, uid: 'b1-uid' }, children: [] },
          ] },
          { data: { text: '说明C', expand: true, uid: 'c-uid' }, children: [] },
        ],
      }],
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
    act(() => {
      useAppStore.getState().setViewMode('kanban')
    })
    expect(await screen.findByTestId('kanban-card-a-uid')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByTestId('kanban-menu-a-uid'), { button: 0 })
    fireEvent.click(await screen.findByTestId('kanban-copy-a-uid'))
    await waitFor(() => expect(writes).toHaveLength(1))
    // 2026-09 粘 AI 防干扰：默认 copyIncludeIconStatus=false 同样管看板卡片复制——
    // @doing 不入产物（用户口径：看板复制粘给 AI 也不受状态标记干扰）
    expect(writes[0]).toContain('# 任务A\n')
    expect(writes[0]).not.toContain('@doing')
    expect(writes[0]).toContain('说明C')
    // 截断口径：B 卡范围（子任务B + B1）不随 A 卡复制——独立卡不产生重复上下文
    expect(writes[0]).not.toContain('子任务B')
    expect(writes[0]).not.toContain('B1')
  })
})

// ── 画布三态装配（2026-09 M1）：EditorView 接线 MarkdownView 浮层 + 归档列上浮宿主 +
//    ZenBar 大纲/归档专有钮（装配骨架同看板浮层用例：渲染 → ready → 切 viewMode）──────
describe('画布三态装配（2026-09 M1）', () => {
  beforeEach(() => {
    useAppStore.setState({ viewMode: 'mindmap' })
  })

  /** 渲染 → ready（不预切态：键盘直达用例自导图态起键；docReady 是三态浮层渲染前置，
   *  emit 必须先于按键——否则 viewMode 已切而浮层不挂） */
  const renderReady = async (): Promise<void> => {
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

  /** 渲染 → ready → 切目标态（renderReady 薄封装；renderKanbanReady 同源约定） */
  const renderReadySwitch = async (v: 'markdown' | 'kanban'): Promise<void> => {
    await renderReady()
    act(() => {
      useAppStore.getState().setViewMode(v)
    })
  }

  test('Markdown 态：viewMode=markdown 挂 MarkdownView，ZenBar 大纲钮在、撤销钮隐藏', async () => {
    await renderReadySwitch('markdown')
    expect(await screen.findByTestId('markdown-view')).toBeInTheDocument()
    expect(screen.getByTestId('fake-canvas')).toBeInTheDocument() // 浮层协议：引擎画布不卸载
    expect(screen.getByTestId('btn-outline-toggle')).toBeInTheDocument() // 大纲钮（Markdown 态专有段）
    expect(screen.queryByTestId('btn-undo')).toBeNull() // Markdown 态隐藏（编辑走 vditor 自有历史）
  })

  test('看板态：归档钮 toggle 驱动 KanbanView 归档列显隐（宿主持有 archiveOpen）', async () => {
    await renderReadySwitch('kanban')
    expect(await screen.findByTestId('kanban-view')).toBeInTheDocument()
    expect(screen.queryByText('归档')).toBeNull() // 收起态：归档列不在（收起条已退役无残留）
    fireEvent.click(screen.getByTestId('btn-kanban-archive'))
    // archiveOpen=true：归档列渲染（archived 列头可见）
    expect(screen.getByText('归档')).toBeInTheDocument()
  })

  test('Ctrl+1/2/3 三态直达：Ctrl+2 进 Markdown、Ctrl+3 进看板（window 直发非输入域照切）', async () => {
    await renderReady()
    expect(screen.getByTestId('zen-bar')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '2', ctrlKey: true })
    await waitFor(() => expect(useAppStore.getState().viewMode).toBe('markdown'))
    expect(await screen.findByTestId('markdown-view')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '3', ctrlKey: true })
    await waitFor(() => expect(useAppStore.getState().viewMode).toBe('kanban'))
    expect(await screen.findByTestId('kanban-view')).toBeInTheDocument()
  })

  test('Ctrl+Shift+K 不再切视图（2026-09 画布三态：直达键落地，翻转键退役）', async () => {
    await renderReady()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(useAppStore.getState().viewMode).toBe('mindmap')
    expect(screen.queryByTestId('kanban-view')).toBeNull()
  })
})

// ── 工作台跨图定位（2026-09 spec §5 文本寻址）：EditorView 引擎就绪消费 pendingLocate ──
describe('工作台跨图定位（2026-09 spec §5）', () => {
  test('引擎就绪消费 pendingLocate：消费即清 + path+text 寻址命中经 locateNode 居中', async () => {
    // 夹具：根 > 分支 > 任务甲（引擎树形态 data.text/data.uid）。任务甲 uid 用 child-uid
    // ——fake renderer.findNodeByUid 仅认 root/child/deep 三 uid，居中断言靠它命中 fakeChildNode
    fakeTree = {
      data: { text: '根', expand: true, uid: 'root-uid' },
      children: [
        { data: { text: '分支', expand: true, uid: 'branch-uid' }, children: [
          { data: { text: '任务甲', expand: true, uid: 'child-uid' }, children: [] },
        ] },
      ],
    }
    await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 分支\n\n### 任务甲\n')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      useAppStore.setState({ pendingLocate: { mapPath: '/ws/a.md', path: ['分支'], text: '任务甲' } })
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
      // 消费触发 setPendingLocate 重渲会重赋模块级 fakeHandle（工厂每渲重建），断言须锁定
      // emit 前实例——mmRef 所持同款约定
      const handle = fakeHandle
      act(() => {
        ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
      })
      expect(useAppStore.getState().pendingLocate).toBeNull() // 消费即清（不残留误定位）
      // 定位生效：getData 全量快照按 path+text 寻址取真 uid → locateNode 居中（路径已全
      // 展开走同步寻址分支，moveNodeToCenter 收 fakeChildNode）
      expect(handle.renderer?.moveNodeToCenter).toHaveBeenCalledWith(fakeChildNode)
      expect(errSpy).not.toHaveBeenCalled() // 全链 try/catch 有出口，命中路径零报错
    } finally {
      errSpy.mockRestore()
    }
  })

  test('首挂未渲 miss：消费经 node_tree_render_end 有限重试后居中（Task 9 定位修复回归）', async () => {
    // 首挂时序（工作台 e2e 实锤）：引擎 render() 排 setTimeout 0，onCanvasReady 时首渲
    // 未落——已展开路径即时寻址必 miss。此前 miss 即放弃居中（大图目标在屏外），修复后
    // 经渲染完成事件重试。fake 模拟：findNodeByUid 首查 null（首渲未落），次查命中
    fakeTree = {
      data: { text: '根', expand: true, uid: 'root-uid' },
      children: [
        { data: { text: '分支', expand: true, uid: 'branch-uid' }, children: [
          { data: { text: '任务甲', expand: true, uid: 'child-uid' }, children: [] },
        ] },
      ],
    }
    await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 分支\n\n### 任务甲\n')
    useAppStore.setState({ pendingLocate: { mapPath: '/ws/a.md', path: ['分支'], text: '任务甲' } })
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
    const handle = fakeHandle
    // 首挂寻址 miss 注入（引擎首渲排队中形态）：首查 null，其后恢复真实寻址
    const realFind = handle.renderer?.findNodeByUid.bind(handle.renderer)
    let finds = 0
    handle.renderer!.findNodeByUid = (uid: string) => {
      finds += 1
      return finds === 1 ? null : realFind?.(uid)
    }
    act(() => {
      ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    })
    expect(useAppStore.getState().pendingLocate).toBeNull() // 消费照常即清（miss 不回滚）
    const center = handle.renderer?.moveNodeToCenter as ReturnType<typeof vi.fn>
    expect(center).not.toHaveBeenCalled() // 首查 miss：不放弃也不误居中，重试挂起
    // 首渲落定（node_tree_render_end）：重试命中，居中生效
    act(() => {
      ;(globalThis as unknown as Record<string, () => void>).__emitRenderEnd!()
    })
    expect(center).toHaveBeenCalledWith(fakeChildNode)
  })

  test('mapPath 不符：弃置寻址器不定位（终审 Important-1 错图消费修复）', async () => {
    // 触发链：点图 B 任务卡 → openMap(B) 失败（被删/坏档）→ EditorView 停 error 态、
    // onCanvasReady 不触发 → 寻址器残留 → 用户切到图 A → 图 A 就绪消费前须校验目标：
    // mapPath 不符即清空弃置 + console.warn 线索，绝不误定位到图 A 的同名节点
    fakeTree = {
      data: { text: '根', expand: true, uid: 'root-uid' },
      children: [
        { data: { text: '分支', expand: true, uid: 'branch-uid' }, children: [
          { data: { text: '任务甲', expand: true, uid: 'child-uid' }, children: [] },
        ] },
      ],
    }
    await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 分支\n\n### 任务甲\n')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // 寻址器绑定打不开的图 B；当前挂载的是图 A（mdPath=/ws/a.md）——path+text 与图 A
      // 内容碰巧全同名（复刻最险形态），校验是唯一防线
      useAppStore.setState({ pendingLocate: { mapPath: '/ws/图B.md', path: ['分支'], text: '任务甲' } })
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
      const handle = fakeHandle
      act(() => {
        ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
      })
      expect(useAppStore.getState().pendingLocate).toBeNull() // 弃置即清（不残留到下一图）
      expect(handle.renderer?.moveNodeToCenter).not.toHaveBeenCalled() // 同名也不误定位
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('目标图与当前图不符'), expect.objectContaining({ mapPath: '/ws/图B.md' }))
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("pendingLocate 带 view:'kanban'（案头跳看板）：消费分派看板态挂载 + 命中卡高亮", async () => {
    // 案头 openTask 前置形态：viewMode 已置看板态 + 寻址器带 view 字段——消费分派
    // toKanban（切看板 + 载荷下发 KanbanView），不走 locateNode 居中
    fakeTree = kanbanTree()
    await fs.writeTextFileAtomic('/ws/a.md', '# 根\n\n## 任务\n')
    useAppStore.setState({ viewMode: 'kanban', pendingLocate: { mapPath: '/ws/a.md', path: [], text: '任务', view: 'kanban' } })
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
      ;(globalThis as unknown as Record<string, () => void>).__emitReady!()
    })
    expect(useAppStore.getState().pendingLocate).toBeNull() // 消费即清
    expect(useAppStore.getState().viewMode).toBe('kanban') // 看板态保持（toKanban idempotent 保险）
    // 看板浮层挂载且命中卡（child-uid，path=[] 直挂根）描边高亮——挂载门是引擎就绪
    // （engineReady）：早挂（docReady 即挂）时 mmRef 尚 null，refresh 静默空转成空板
    const card = await screen.findByTestId('kanban-card-child-uid')
    await waitFor(() => expect(card.className).toContain('ring-2'))
  })
})

// 2026-09 导航系统 spec §3/§7 → 画布三态 M3（工作台并入案头）：两空间收敛后
// 返回恒落案头（提示恒「返回案头」）；工作台直达钮随机制退役
test('返回钮:btn-back 恒落案头(两空间收敛,不再有工作台来路)', async () => {
  await useAppStore.getState().openMap('/ws/a.md')
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
  // 提示与 aria 恒「返回案头」（backTarget 机制退役）
  expect(screen.getByTestId('btn-back').getAttribute('aria-label')).toBe('返回案头')
  fireEvent.click(screen.getByTestId('btn-back'))
  await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
})

test('Alt+← 与返回钮同效(案头来路落案头)', async () => {
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
  fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
  await waitFor(() => expect(useAppStore.getState().route).toBe('library'))
})

test('砚栏设置钮打开 App 级设置对话框', async () => {
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
  fireEvent.click(screen.getByTestId('btn-editor-settings'))
  await waitFor(() => expect(useAppStore.getState().appDialog).toBe('settings'))
})
