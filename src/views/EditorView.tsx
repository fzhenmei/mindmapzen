import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, findSubtreeByUid, serialize } from '../services/mdTree'
import { applyMultilinePaste } from '../services/multiline'
import { applyCopySettings, stripTreeBody } from '../services/copyFilter'
import { absolutizeImagePaths } from '../services/aiImagePaths'
import { toNativePath } from '../services/nativePath'
import type { WriteClipboard } from '../services/clipboard'
import { layoutToEngine, type LayoutKind } from '../editor/layoutMap'
import { centerRoot, fitView } from '../editor/viewOps'
import { useCanvasPaste } from '../hooks/useCanvasPaste'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { ExportPorts, RegisterCloseGuard } from '../types/ports'
import { useSavePipeline } from '../hooks/useSavePipeline'
import { useConflictAsk } from '../hooks/useConflictAsk'
import { useLinkPurify } from '../hooks/useLinkPurify'
import { useIgnoredFlow } from '../hooks/useIgnoredFlow'
import { useCloseGuard } from '../hooks/useCloseGuard'
import { useActiveSelection } from '../hooks/useActiveSelection'
import { useBodyDialog } from '../hooks/useBodyDialog'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { useExportFlow } from '../hooks/useExportFlow'
import { useEditorHotkeys } from '../hooks/useEditorHotkeys'
import { useQuickSwitch } from '../hooks/useQuickSwitch'
import { useOpenDocument } from '../hooks/useOpenDocument'
import { useMapStats } from '../hooks/useMapStats'
import CanvasHint from '../components/CanvasHint'
import { computeNodeStampPos, startLinkFromActive, useNodeActions } from '../hooks/useNodeActions'
import { useIconPicker, nodeIconsOf, nodeTextOf } from '../hooks/useIconPicker'
import { useTagPicker, nodeTagsOf, usedTagsOf } from '../hooks/useTagPicker'
import { useImageEdit, nodeImageOf } from '../hooks/useImageEdit'
import EditorCaption from '../components/EditorCaption'
import EditorCanvasArea, { type OpenFailInfo } from './EditorCanvasArea'
import { TooltipProvider } from '../components/ui/tooltip'
import NodeActions from '../components/NodeActions'
import MultiSelectBar from '../components/MultiSelectBar'
import EditorDialogs from '../components/EditorDialogs'
import BodyDialog from '../components/BodyDialog'
import QuickSwitchDialog from '../components/QuickSwitchDialog'
import MapTabs from '../components/MapTabs'
import IgnoredBlocksBanner from '../components/IgnoredBlocksBanner'
import SaveStamp, { type StampKind } from '../components/SaveStamp'
import CopyStamp from '../components/CopyStamp'
import ZenBar from '../components/ZenBar'
interface Props {
  mdPath: string
  openInEditor: (path: string) => void
  /** 剪贴板写入端口：生产为 Tauri 插件实现，测试注入内存实现 */
  writeClipboard: WriteClipboard
  /** 导出与复制图片端口（M5b）：生产为 Tauri save 对话框 + writeImage，测试注入记录桩 */
  exportPorts: ExportPorts
  /** 关闭守卫注册端口：生产为 Tauri onCloseRequested，测试注入捕获桩 */
  registerCloseGuard: RegisterCloseGuard
  /** 退出应用端口：生产为 getCurrentWindow().destroy()，测试记录调用 */
  exitApp: () => void
  /** 选图端口（M19 插图）：生产为 Tauri 对话框 + readFile 字节；E2E harness 桩 */
  pickImageFile: () => Promise<{ name: string; bytes: Uint8Array } | null>
  /** 剪贴板读图端口（粘贴截图）：生产为 Tauri readImage + Canvas 编码 PNG；E2E harness 桩 */
  readClipboardImage: () => Promise<{ name: string; bytes: Uint8Array } | null>
}

export default function EditorView({ mdPath, openInEditor, writeClipboard, exportPorts, registerCloseGuard, exitApp, pickImageFile, readClipboardImage }: Readonly<Props>) {
  const { t } = useTranslation()
  const { adapter, markDirty, clearDirty, backToLibrary, setError } = useAppStore()
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const dirty = useAppStore((s) => s.dirty)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  // 复制选项（2026-09 自设置面板移入砚栏复制钮下拉）：订阅驱动勾选态；doCopy 路径仍 getState 实时取
  const copySettings = useAppStore((s) => s.settings)
  const mmRef = useRef<MindMapHandle | null>(null)
  const dirtyRef = useRef(false)
  const layoutRef = useRef<LayoutKind>('mindmap') // 保存时写入 sidecar.layout 的真实值
  // 布局双状态（spec §3.7）：initialLayout=挂载期布局（只来自 sidecar）；layout=当前激活——切换走 setLayout 即时重排不重挂载
  const [layout, setLayout] = useState<LayoutKind>('mindmap')
  const [initialLayout, setInitialLayout] = useState<LayoutKind>('mindmap')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<OpenFailInfo | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)
  const [stamp, setStamp] = useState<{ kind: StampKind; seq: number } | null>(null) // 印记：显式保存/复制成功后闪现 1.2s；seq 每次触发自增，作 SaveStamp 的 key 强制重挂载
  const stampSeqRef = useRef(0) // 印记序号：每次盖印自增，key 变化强制重挂载（重置 1.2s 计时，且不因旧印记未卸载而失效）
  const [copyStamp, setCopyStamp] = useState<{ kind: 'copied-md' | 'copied-node'; left: number; top: number; seq: number } | null>(null) // 复制印记：贴目标节点上方闪现（右上角对画布内操作不可见）；锚定版独立计时序号
  const copyStampSeqRef = useRef(0)
  const [newMapOpen, setNewMapOpen] = useState(false) // 新建导图对话框（2026-09 画布内入口）：复用案头 NewMapDialog，确认走 leaveTo 安全链

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  // 连线净化（M5d Task 2）：会话注册表（uid → 目标名）序列化注入/画线桥接/复制共享；setLinkAdjust（Task 5）注入 sidecar 弯曲记忆
  const { registry, purify, rebuildFromRegistry, setLinkAdjust } = useLinkPurify(mmRef)

  // 题签统计行（2026-09）：节点数 + 最后保存时间；先于保存管线定义（onSaved 回调 markSaved）
  const stats = useMapStats()

  // 冲突裁决（外部变更防护）：保存链挂起等三态对话框；reload 丢弃内存编辑重挂重载
  const conflict = useConflictAsk(dirtyRef, clearDirty)

  // 保存管线（M5a 拆分）：串行保存链/自动保存/布局落盘；脏标记 ref 归本视图持有（守卫「放弃」路径也读写）
  const pipeline = useSavePipeline({
    adapter,
    mdPath,
    mmRef,
    layoutRef,
    dirtyRef,
    registry,
    onDirtyChange: (isDirty) => (isDirty ? markDirty() : clearDirty()),
    onError: setError,
    // 落盘后按注册表重建双链（M5d：显示文本已剥离，注册表是连线数据源）+ 统计行记保存时刻
    onSaved: () => {
      rebuildFromRegistry()
      stats.markSaved()
    },
    // 外部变更裁决（多实例/外部编辑器改盘防护）：保存链挂起等本视图的冲突对话框三态
    onExternalConflict: conflict.ask,
  })

  // 忽略块流（M5a 拆分）：未映射块状态与显式保存确认门（确认挂起前暂停自动保存）
  const flow = useIgnoredFlow({ clearPendingAutosave: pipeline.clearPendingAutosave })

  // 选中跟踪（M5a 拆分）：激活节点 uid 的 ref/state 双轨与复制前的陈旧清理兜底
  const selection = useActiveSelection()

  // 正文弹窗（2026-09-08 弹窗化；模态一次编辑一个节点）：开闭/防抖写回在 hook，
  // 弹窗本体在 BodyDialog.tsx（无护栏，遮罩锁选中无联动载入）
  const bodyDialog = useBodyDialog(mmRef, selection.activeUidRef)
  // 图标管理器（M18）：确认即注册新图标 + SET_NODE_ICON；无载荷上报走保存链（markDirty 由管线置脏）
  const iconPick = useIconPicker(mmRef, selection.activeUidRef, () => pipeline.onTreeDataChange())
  // 标签选择器：确认即 SET_NODE_TAG 整组覆写；无载荷上报走保存链（同上）
  const tagPick = useTagPicker(mmRef, selection.activeUidRef, () => pipeline.onTreeDataChange())
  // 插图编辑（M19 + 粘贴截图）：选图/粘贴复制入 assets/ + imgMap 运行时注入 + SET_NODE_IMAGE
  const imageEdit = useImageEdit(
    mmRef,
    selection.activeUidRef,
    adapter,
    workspaceDir,
    pickImageFile,
    readClipboardImage,
    () => pipeline.onTreeDataChange(),
  )
  const canvasPaste = useCanvasPaste(mmRef, selection.activeUidsRef, imageEdit.pasteToNodes)

  // 选中节点浮动操作条锚点（验收轮）：备注/连线两钮免记快捷键；定位/刷新逻辑在 hook（行数护栏）
  const nodePos = useNodeActions(mmRef, selection.activeUid)
  const undoRedo = useUndoRedo() // 回退/重做（v1.1）：back_forward 历史态驱动按钮禁用，命令走引擎 BACK/FORWARD

  /** 盖印记（Task 7）：seq 自增 → key 变化强制重挂载（到期前重置计时 / 到期后再触发也全新挂载） */
  const flashStamp = (kind: StampKind): void => {
    stampSeqRef.current += 1
    setStamp({ kind, seq: stampSeqRef.current })
  }

  /** 盖复制印记（贴目标节点）：选中节点上方；无选中（整图 md 复制）锚根节点；几何缺失
   *  （未布局/假画布）兜底右上角 SaveStamp。seq 重挂载语义同 flashStamp */
  const flashCopy = (kind: 'copied-md' | 'copied-node'): void => {
    const mm = mmRef.current
    const uid = selection.activeUidRef.current
    const node = (uid ? mm?.renderer?.findNodeByUid(uid) : null) ?? mm?.renderer?.root
    const pos = mm ? computeNodeStampPos(node, mm.view) : null
    if (pos === null) {
      flashStamp(kind)
      return
    }
    copyStampSeqRef.current += 1
    setCopyStamp({ kind, left: pos.left, top: pos.top, seq: copyStampSeqRef.current })
  }

  // 导出与复制为图片（M5b 拆出）：对话框状态与三入口执行链（行数护栏）；端口经 props 注入
  const exportFlow = useExportFlow(mmRef, adapter, name, exportPorts, flashStamp, setError)

  /** 复制文件路径（2026-09）：mdPath 入剪贴板（发给 AI 读），出口分隔符按平台归一（toNativePath，同批修复） */
  const copyPath = (): void => {
    void writeClipboard(toNativePath(mdPath)).then(
      () => flashStamp('copied'),
      (e) => setError(t('errors.copyPathFailed', { reason: String(e) })),
    )
  }

  /** 复制范围解析：有选中节点→该 uid 子树（从 H1 重计层级）；否则整图；陈旧 uid（未命中渲染树，
   *  如撤销删除）清选中回退整图。正文按 settings 树层剥除（终审 C1，先于序列化——md 层正则
   *  剥 `> ` 行会误伤正文代码块/引用行）；md 层后处理仅剩双链括号（getState 取实时值）。
   *  尾段图片引用相对→绝对（2026-09）：须在剥正文之后——头注引用行不能被一并剥掉。序列化同步段
   *  try 兜底（2026-09-07 回归：Word 粘贴携 \r\n 致 assert 抛错曾无声失败），异步段 then 同口径 */
  const doCopy = (): void => {
    const mm = mmRef.current
    if (!mm) return
    let md: string
    try {
      const full = mm.getData()
      selection.clearStaleIfMissing(full)
      const uid = selection.activeUidRef.current
      const active = uid ? findSubtreeByUid(full, uid) : null
      const settings = useAppStore.getState().settings
      let zen = engineTreeToZen(active ?? full).tree
      if (!settings.copyIncludeBody) zen = stripTreeBody(zen)
      md = applyCopySettings(serialize(zen, registry.byUid), settings)
    } catch (e) {
      setError(t('errors.copyMdFailed', { reason: e instanceof Error ? e.message : String(e) }))
      return
    }
    const wsDir = useAppStore.getState().workspaceDir
    if (wsDir !== null) md = absolutizeImagePaths(md, wsDir)
    void writeClipboard(md).then(
      () => flashCopy('copied-md'),
      (e) => setError(t('errors.copyMdFailed', { reason: String(e) })),
    )
  }

  /** 落盘 + 成功印记（Task 7）：此前有脏内容且落盘成功才盖「已存」；干净状态下保存是 no-op，不印记 */
  const saveAndStamp = async (): Promise<boolean> => {
    const wasDirty = dirtyRef.current
    const ok = await pipeline.saveNow()
    if (ok && wasDirty) flashStamp('saved')
    return ok
  }

  /** 显式保存统一入口（spec §3.5）：有未映射块且本会话未确认过 → 经 flow 门弹确认挂起本次保存，返回 false
   *  与「保存失败」同义（留在原界面）；自动保存不经此入口（每 5 秒弹窗扰人，静默丢弃，横幅已知情）。
   *  2026-09（I-2）：先冲刷正文防抖草稿——否则 Ctrl+S 落盘的 md 缺防抖窗内尾部输入，
   *  「已存」印记强化错觉，Ctrl+S→立刻关窗路径尾部永久丢失 */
  const explicitSave = async (): Promise<boolean> => {
    bodyDialog.flushNow()
    if (!flow.gateExplicitSave()) return false
    return saveAndStamp()
  }

  // 快速切换（v2.5）：浮层候选/切换链/ping-pong（含返回案头共用的安全链 leaveTo）
  const quick = useQuickSwitch({ mdPath, workspaceDir, pipeline, explicitSave })

  // 顶部条取色令牌（v2.5）：编辑器全屏画布顶部是 --background，挂载即声明（TitleBar 换底色）
  useEffect(() => useAppStore.setState({ titlebarBg: '--background' }), [])

  /** 关闭请求先冲正文防抖草稿（终审 I2）：干净图防抖窗内直接关窗（Alt+F4/点 X）时
   *  dirty 未及置（data_change 经引擎节流异步），返回「是否有草稿被冲」供守卫按三态处理 */
  const flushPending = (): boolean => {
    if (!bodyDialog.hasPending()) return false
    bodyDialog.flushNow()
    return true
  }

  // 关闭守卫（M5a 拆分）：拦截注册/三态选择/防误触；保存分支走上面 explicitSave 组合，对话框渲染留本视图
  const guard = useCloseGuard({ registerCloseGuard, exitApp, dirtyRef, explicitSave, clearDirty, flushPending })

  // 打开文档加载链（2026-09 拆至 useOpenDocument，行数护栏）：读 md → parse → sidecar →
  // 忽略块/弯曲记忆上报 → 布局三处同步 → 插图元数据 → 引擎树落 state。
  // 失败统一出口（2026-09 优雅恢复分型，见 useOpenDocument.onFail 注释）：面板只占画布内容区
  const onOpenFail = (kind: OpenFailInfo['kind'], error: string, raw: string): void => {
    setState('error')
    setErrorInfo({ kind, error, raw })
  }
  useOpenDocument({
    adapter,
    mdPath,
    workspaceDir,
    onStart: () => {
      dirtyRef.current = false
    },
    onIgnored: flow.setFromParse,
    onLinkAdjust: setLinkAdjust,
    onLayout: (initial) => {
      setInitialLayout(initial)
      setLayout(initial)
      layoutRef.current = initial
    },
    onTree: (tree) => {
      setEngineTree(tree)
      stats.onDataChange(tree) // 统计行初值（2026-09）：与引擎树落 state 同批（不产生额外重渲）
    },
    onRaw: pipeline.initBaseline, // 冲突检测基线（打开时的磁盘原文）
    onFileTime: stats.initSavedAt, // 「保存于」初值 = 文件 mtime（会话内保存链成功后刷新）
    onReady: () => setState('ready'),
    onFail: onOpenFail,
  })

  // 任一对话框在开（终审修复）：正文弹窗快捷键守卫——互斥期不再开；ref 渲染期同步供只绑一次闭包读，state 供浮动条隐藏
  // v2.5：切换浮层（搜索/轮换）同列互斥；轮换中的 Tab 由 useQuickSwitch 捕获接管不经此守卫
  // 2026-09：新建导图对话框同列互斥；2026-09-08 弹窗化：正文弹窗同列互斥（模态锁节点）
  const anyDialog = guard.guarding || flow.confirming || exportFlow.open || quick.switchOpen || quick.cycle !== null || newMapOpen || conflict.open || bodyDialog.open
  const anyDialogRef = useRef(false)
  anyDialogRef.current = anyDialog
  // 快捷键（Ctrl+S / Ctrl+C 复制 md / 正文面板开关 Shift+F2 / 切换 Ctrl+P、Ctrl+Tab）拆至 useEditorHotkeys（验收轮，行数护栏）
  useEditorHotkeys({
    doCopy,
    explicitSave,
    toggleBodyDialog: bodyDialog.toggle,
    anyDialogRef,
    openQuickSwitch: quick.open,
    cycleStep: quick.cycleStep,
  })

  useEffect(() => {
    return () => pipeline.unmountFlush()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount 冲刷，saveNow 依赖 refs
  }, [])

  /** 布局切换（spec §3.7 + 审查裁定）：引擎 setLayout 即时重排，不置脏、不触发内容保存。
   *  但布局偏好须即时落 sidecar——否则 writeOnce 的 !dirty 早退使偏好永不落盘（元数据即时落盘不违背「不置脏不自动保存」） */
  const switchLayout = (kind: LayoutKind) => {
    mmRef.current?.setLayout(layoutToEngine(kind))
    layoutRef.current = kind
    setLayout(kind)
    void pipeline.persistLayoutSidecar()
    // 记住偏好：用户选择过的布局成为新建/导入/无 sidecar 导图的默认（验收轮三）
    void useAppStore.getState().setPreferredLayout(kind)
  }

  // 壳层保留（2026-09 优雅恢复）：内容区三态在 EditorCanvasArea，ZenBar/题签仅就绪态渲染，
  // 对话框组（含快速切换浮层）始终挂载——打开失败时 Ctrl+P / Ctrl+Tab / 返回案头照常可达
  const docReady = state === 'ready'

  // @container：停泊栏避让的查询容器（UI评审P1，题签/主题钮 @max-[1150px] 上移基准）。
  // 2026-09-08 弹窗化：画布让位（.body-open 收窄右缘 + 延迟 resize）随常驻面板退役——
  // 模态弹窗浮于画布上，画布宽度恒定不再重排
  return (
    <div className="editor @container"><TooltipProvider>
      <div className="canvas-host">
        <EditorCanvasArea
          state={state}
          errorInfo={errorInfo}
          mdPath={mdPath}
          openInEditor={openInEditor}
          onBack={() => void quick.leaveTo(backToLibrary)}
          onSwitch={quick.open}
          engineTree={engineTree}
          registry={registry}
          initialLayout={initialLayout}
          resolvedTheme={resolvedTheme}
          mmRef={mmRef}
          onCanvasReady={(mm) => {
            purify(mm) // 连线净化（M5d Task 2）：首帧后建注册表 → 剥显示文本 → 落初始连线
            undoRedo.bind(mm) // 回退/重做（v1.1）：订阅 back_forward 历史态（基线种子随净化尾部播入）
          }}
          onDataChange={(data) => {
            stats.onDataChange(data) // 统计行（2026-09）：携带快照时重数节点
            pipeline.onTreeDataChange(data)
          }}
          onActiveChange={selection.handleActiveChange}
          onPaste={(raw) => applyMultilinePaste(mmRef.current, selection.activeUidRef.current, raw)}
          {...canvasPaste}
          // 快捷键对调：Control+Shift+c 画布内复制节点成功 → 贴选中节点盖「已复制为节点」墨青印
          onNodeCopy={() => flashCopy('copied-node')}
        />
      </div>
      {/* 顶部导图胶囊条（2026-09 鼠标流切换）：最近打开常驻平铺，点选走安全链；仅一张时
          组件内不渲染。悬浮顶部居中（悬浮停泊同 ZenBar——canvas-host 恒满屏，引擎零配合） */}
      <MapTabs tabs={quick.mapTabCandidates} currentMdPath={mdPath} onPick={(p) => void quick.switchTo(p)} />
      {/* 空图引导（2026-09 UI 评审 P2-2）：仅根节点时的建节点快捷键提示，条件与动机见组件注释 */}
      {docReady && <CanvasHint tree={engineTree} nodeCount={stats.nodeCount} />}
      {/* 选中节点浮动条（验收轮）：正文笔 + 连线箭头等，免记快捷键；对话框开时隐藏，建线态由 hook 内避让 */}
      {nodePos && !anyDialog && (
        <NodeActions
          pos={nodePos}
          onBodyClick={bodyDialog.toggle}
          onLinkClick={() => startLinkFromActive(mmRef.current)}
          onIconClick={() =>
            iconPick.openPicker(nodeTextOf(mmRef.current, selection.activeUidRef.current), nodeIconsOf(mmRef.current, selection.activeUidRef.current))
          }
          onTagClick={() =>
            tagPick.openPicker(
              nodeTextOf(mmRef.current, selection.activeUidRef.current),
              nodeTagsOf(mmRef.current, selection.activeUidRef.current),
              usedTagsOf(mmRef.current),
            )
          }
          onImageClick={() =>
            imageEdit.openDialog(nodeTextOf(mmRef.current, selection.activeUidRef.current), nodeImageOf(mmRef.current, selection.activeUidRef.current))
          }
        />
      )}
      {/* 多选浮条（2026-09 圈选批量操作）：圈选/Ctrl 多选 >1 节点时出现于砚栏上方，计数 + 批量删除
          （REMOVE_NODE 删全部激活节点及子树，一条撤销记录）。单选时 activeUid 退化为 null，
          上方 NodeActions 已隐藏，两者互斥不并现 */}
      {selection.activeCount > 1 && !anyDialog && (
        <MultiSelectBar count={selection.activeCount} onDelete={() => mmRef.current?.execCommand('REMOVE_NODE')} />
      )}
      {/* 浮动砚栏（M5a 拆分至 ZenBar）。仅就绪态渲染（2026-09）：错误/加载态引擎未建，按钮无意义 */}
      {docReady && (
      <ZenBar
        onBack={() => void quick.leaveTo(backToLibrary)} // 失败/确认挂起：留在编辑器（确认后仅落盘，不自动导航）
        onSwitchClick={quick.open}
        onNewClick={() => setNewMapOpen(true)}
        undoRedo={undoRedo}
        onCopyClick={doCopy}
        copySettings={copySettings}
        onToggleCopySetting={(key) => void useAppStore.getState().setSetting(key, !copySettings[key])}
        onCopyPathClick={copyPath}
        scope={selection.activeUid ? 'branch' : 'full'}
        onSaveClick={() => void explicitSave()}
        onBodyClick={bodyDialog.toggle}
        bodyActive={bodyDialog.open}
        onExportClick={exportFlow.openExport}
        onZoomOut={() => mmRef.current?.view.narrow()}
        onZoomIn={() => mmRef.current?.view.enlarge()}
        onCenterRoot={() => mmRef.current && centerRoot(mmRef.current)}
        onFit={() => mmRef.current && fitView(mmRef.current)}
        layout={layout}
        onSwitchLayout={switchLayout}
      />
      )}
      {/* 正文弹窗（2026-09-08 弹窗化）：模态大弹窗浮于画布，进 anyDialog 互斥总线；
          bodyDraft !== null 即开（渲染门兼卸载门，close 置 null 即整树摘除） */}
      {docReady && bodyDialog.bodyDraft !== null && <BodyDialog {...bodyDialog} />}
      {/* 印记（Task 7）：显式保存成功朱砂印 / 复制成功墨青印，右上角闪现 1.2s（自动保存静默不印记）。
          key=seq 使重复盖印强制重挂载；onDone 到期受控卸载（置 null），否则旧 state 残留令后续同值盖印失效 */}
      {stamp && <SaveStamp key={stamp.seq} kind={stamp.kind} onDone={() => setStamp(null)} />}
      {/* 复制印记：贴目标节点上方闪现（视线在操作处）；几何缺失时 flashCopy 已兜底走右上角，此处只渲染锚定版 */}
      {copyStamp && (
        <CopyStamp key={copyStamp.seq} kind={copyStamp.kind} pos={{ left: copyStamp.left, top: copyStamp.top }} onDone={() => setCopyStamp(null)} />
      )}
      {/* 左下题签 + 朱砂脏印 + 统计行；右下主题钮（M5a 拆分至 EditorCaption）。仅就绪态渲染（2026-09） */}
      {docReady && <EditorCaption name={name} dirty={dirty} nodeCount={stats.nodeCount} savedAt={stats.savedAt} />}
      {/* 忽略块横幅改挂砚栏下方（.zen-banner 浮于画布）——既有结构照搬，仅换容器类（Task 6 迁移） */}
      {flow.ignored.length > 0 && <IgnoredBlocksBanner blocks={flow.ignored} />}
      {/* 对话框互斥约定（ui Dialog）：本视图至多同时一个对话框——guarding 优先于 flow.confirming
          （守卫先收起、确认框随即接管，故 !guarding 门闩）；全部对话框渲染已迁 EditorDialogs
          （M5b Task 1 起；2026-09 图标/插图/快速切换三框随行数护栏迁入），槽非 null 即开 */}
      <EditorDialogs
        guarding={guard.guarding}
        mapName={name}
        onGuardChoice={(c) => void guard.onGuardChoice(c)}
        confirmingIgnored={flow.confirming && !guard.guarding}
        ignored={flow.ignored}
        onIgnoredConfirm={() => {
          flow.confirmProceed()
          void saveAndStamp() // 仅落盘（含印记）：确认前挂起的返回/关闭动作不自动续行（用户再点一次）
        }}
        onIgnoredCancel={flow.confirmCancel}
        // 导出框同样让位互斥（guarding/confirming 优先，actions 稳定引用无重渲负担）
        exportActions={
          exportFlow.open && !guard.guarding && !flow.confirming ? exportFlow.actions : null
        }
        // 图标管理器（M18）：互斥优先级同上（guarding > confirming > 图标）
        iconPicker={
          iconPick.open && !guard.guarding && !flow.confirming
            ? { nodeText: iconPick.nodeText, current: iconPick.icons, onCancel: iconPick.close, onConfirm: iconPick.apply }
            : null
        }
        // 标签选择器：同上
        tagPicker={
          tagPick.open && !guard.guarding && !flow.confirming
            ? { nodeText: tagPick.nodeText, current: tagPick.tags, used: tagPick.used, onCancel: tagPick.close, onConfirm: tagPick.apply }
            : null
        }
        // 插图（M19 + 粘贴截图）：同上
        imageEdit={
          imageEdit.open && !guard.guarding && !flow.confirming
            ? {
                nodeText: imageEdit.nodeText,
                current: imageEdit.current,
                preview: imageEdit.preview,
                pasteError: imageEdit.pasteError,
                onPick: () => void imageEdit.pickAndApply(),
                onPaste: (image) => void imageEdit.pasteAndApply(image),
                onPasteClick: () => void imageEdit.pasteFromClipboard(),
                onRemove: imageEdit.remove,
                onCancel: imageEdit.close,
              }
            : null
        }
        // 快速切换浮层（v2.5）：槽组装拆至 buildQuickSwitchSlot（复杂度护栏，槽内两形态互斥）
        quickSwitch={buildQuickSwitchSlot(guard, flow, quick)}
        // 新建导图对话框（2026-09 画布内入口）：互斥优先级同上（guarding > confirming > 新建）。
        // 确认即关框走 leaveTo 安全链——保存当前图成功才 createAndOpen 跳转；保存失败/未映射块
        // 确认挂起留在原图（与「返回案头」同款约定，确认后不自动续行）。创建失败（如重名）走横幅
        // 提示不回框内（框已关，名字需重填——编辑器场景低频，可接受降级）
        newMap={
          newMapOpen && !guard.guarding && !flow.confirming
            ? {
                onCancel: () => setNewMapOpen(false),
                onConfirm: (name, templateContent) => {
                  setNewMapOpen(false)
                  void quick
                    .leaveTo(() => useAppStore.getState().createAndOpen(name, templateContent))
                    .catch((e) => setError(t('errors.createMapFailed', { reason: e instanceof Error ? e.message : String(e) })))
                },
              }
            : null
        }
        // 冲突裁决框（外部变更防护）：保存链挂起等待，浮条/快捷键让位（anyDialog）
        conflict={conflict.open ? { mapName: name, onChoice: conflict.onChoice } : null}
      />
    </TooltipProvider></div>
  )
}

/** 快速切换浮层槽组装（v2.5.1 拆出，复杂度护栏）：搜索态（Ctrl+P）/ 轮换态（Ctrl+Tab）
 *  两形态互斥共用——cycleActive 传 undefined 即搜索态；守卫/确认框让位互斥（同其他槽） */
function buildQuickSwitchSlot(
  guard: Readonly<{ guarding: boolean }>,
  flow: Readonly<{ confirming: boolean }>,
  quick: ReturnType<typeof useQuickSwitch>,
): ComponentProps<typeof QuickSwitchDialog> | null {
  if (guard.guarding || flow.confirming) return null
  if (!quick.switchOpen && quick.cycle === null) return null
  return {
    candidates: quick.cycle !== null ? quick.cycleCandidates : quick.candidates,
    cycleActive: quick.cycle ?? undefined,
    onActiveChange: quick.setCycleActive,
    onPick: (p) => void quick.switchTo(p),
    onClose: quick.cycle !== null ? quick.cancelCycle : quick.close,
  }
}
