import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, findSubtreeByUid, serialize } from '../services/mdTree'
import { applyMultilinePaste } from '../services/multiline'
import { applyCopySettings } from '../services/copyFilter'
import type { WriteClipboard } from '../services/clipboard'
import MindMapCanvas from '../editor/MindMapCanvas'
import { engineThemeName } from '../editor/engineThemes'
import { layoutToEngine, type LayoutKind } from '../editor/layoutMap'
import { centerRoot, fitView } from '../editor/viewOps'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { ExportPorts, RegisterCloseGuard } from '../types/ports'
import { useSavePipeline } from '../hooks/useSavePipeline'
import { useLinkPurify } from '../hooks/useLinkPurify'
import { useIgnoredFlow } from '../hooks/useIgnoredFlow'
import { useCloseGuard } from '../hooks/useCloseGuard'
import { useActiveSelection } from '../hooks/useActiveSelection'
import { useNoteEdit } from '../hooks/useNoteEdit'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { useExportFlow } from '../hooks/useExportFlow'
import { useEditorHotkeys } from '../hooks/useEditorHotkeys'
import { useQuickSwitch } from '../hooks/useQuickSwitch'
import { useOpenDocument } from '../hooks/useOpenDocument'
import { useMapStats } from '../hooks/useMapStats'
import { computeNodeStampPos, startLinkFromActive, useNodeActions } from '../hooks/useNodeActions'
import { useIconPicker, nodeIconsOf, nodeTextOf } from '../hooks/useIconPicker'
import { useImageEdit, nodeImageOf } from '../hooks/useImageEdit'
import EditorCaption from '../components/EditorCaption'
import EditorErrorPanel from '../components/EditorErrorPanel'
import { TooltipProvider } from '../components/ui/tooltip'
import NodeActions from '../components/NodeActions'
import EditorDialogs from '../components/EditorDialogs'
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
  const { adapter, markDirty, clearDirty, backToLibrary, setError } = useAppStore()
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const dirty = useAppStore((s) => s.dirty)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  const mmRef = useRef<MindMapHandle | null>(null)
  const dirtyRef = useRef(false)
  const layoutRef = useRef<LayoutKind>('mindmap') // 保存时写入 sidecar.layout 的真实值
  // 布局双状态（spec §3.7）：initialLayout=挂载期布局（只来自 sidecar）；layout=当前激活——切换走 setLayout 即时重排不重挂载
  const [layout, setLayout] = useState<LayoutKind>('mindmap')
  const [initialLayout, setInitialLayout] = useState<LayoutKind>('mindmap')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<{ error: string; raw: string } | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)
  const [stamp, setStamp] = useState<{ kind: StampKind; seq: number } | null>(null) // 印记：显式保存/复制成功后闪现 1.2s；seq 每次触发自增，作 SaveStamp 的 key 强制重挂载
  const stampSeqRef = useRef(0) // 印记序号：每次盖印自增，key 变化强制重挂载（重置 1.2s 计时，且不因旧印记未卸载而失效）
  const [copyStamp, setCopyStamp] = useState<{ kind: 'copied-md' | 'copied-node'; left: number; top: number; seq: number } | null>(null) // 复制印记：贴目标节点上方闪现（右上角对画布内操作不可见）；锚定版独立计时序号
  const copyStampSeqRef = useRef(0)

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  // 连线净化（M5d Task 2）：会话注册表（uid → 目标名）序列化注入/画线桥接/复制共享；setLinkAdjust（Task 5）注入 sidecar 弯曲记忆
  const { registry, purify, rebuildFromRegistry, setLinkAdjust } = useLinkPurify(mmRef)

  // 题签统计行（2026-09）：节点数 + 最后保存时间；先于保存管线定义（onSaved 回调 markSaved）
  const stats = useMapStats()

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
  })

  // 忽略块流（M5a 拆分）：未映射块状态与显式保存确认门（确认挂起前暂停自动保存）
  const flow = useIgnoredFlow({ clearPendingAutosave: pipeline.clearPendingAutosave })

  // 选中跟踪（M5a 拆分）：激活节点 uid 的 ref/state 双轨与复制前的陈旧清理兜底
  const selection = useActiveSelection()

  // 节点备注编辑（M5b 拆出）：对话框状态与 SET_NODE_DATA 保存链（行数护栏）
  const noteEdit = useNoteEdit(mmRef, selection.activeUidRef)
  // 图标管理器（M18）：确认即注册新图标 + SET_NODE_ICON；无载荷上报走保存链（markDirty 由管线置脏）
  const iconPick = useIconPicker(mmRef, selection.activeUidRef, () => pipeline.onTreeDataChange())
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

  /** 复制文件路径（2026-09）：mdPath 绝对路径入剪贴板（发给 AI 直接读本文件），成功盖「已复制」墨青印 */
  const copyPath = (): void => {
    void writeClipboard(mdPath).then(
      () => flashStamp('copied'),
      (e) => setError('复制路径失败：' + String(e)),
    )
  }

  /** 复制范围解析：有选中节点→该 uid 子树（从 H1 重计层级）；否则整图。陈旧 uid 兜底：未命中渲染树
   *  （如撤销删除）时清选中回退整图。后处理按 settings 剥备注引用块/双链括号（getState 取实时值）。
   *  序列化同步无守卫（纯函数）；写剪贴板异步段以 then 双参兜错（Sonar S3776 认知复杂度） */
  const doCopy = (): void => {
    const mm = mmRef.current
    if (!mm) return
    const full = mm.getData()
    selection.clearStaleIfMissing(full)
    const uid = selection.activeUidRef.current
    const active = uid ? findSubtreeByUid(full, uid) : null
    const md = applyCopySettings(
      serialize(engineTreeToZen(active ?? full).tree, registry.byUid),
      useAppStore.getState().settings,
    )
    void writeClipboard(md).then(
      () => flashCopy('copied-md'),
      (e) => setError('复制失败：' + String(e)),
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
   *  与「保存失败」同义（留在原界面）；自动保存不经此入口（每 5 秒弹窗扰人，静默丢弃，横幅已知情） */
  const explicitSave = async (): Promise<boolean> => {
    if (!flow.gateExplicitSave()) return false
    return saveAndStamp()
  }

  // 快速切换（v2.5）：浮层候选/切换链/ping-pong（含返回案头共用的安全链 leaveTo）
  const quick = useQuickSwitch({ mdPath, workspaceDir, pipeline, explicitSave })

  // 顶部条取色令牌（v2.5）：编辑器全屏画布顶部是 --background，挂载即声明（TitleBar 换底色）
  useEffect(() => useAppStore.setState({ titlebarBg: '--background' }), [])

  // 关闭守卫（M5a 拆分）：拦截注册/三态选择/防误触；保存分支走上面 explicitSave 组合，对话框渲染留本视图
  const guard = useCloseGuard({ registerCloseGuard, exitApp, dirtyRef, explicitSave, clearDirty })

  // 打开文档加载链（2026-09 拆至 useOpenDocument，行数护栏）：读 md → parse → sidecar →
  // 忽略块/弯曲记忆上报 → 布局三处同步 → 插图元数据 → 引擎树落 state
  const failLoad = (error: string, raw = ''): void => {
    setState('error')
    setErrorInfo({ error, raw })
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
    onFileTime: stats.initSavedAt, // 「保存于」初值 = 文件 mtime（会话内保存链成功后刷新）
    onReady: () => setState('ready'),
    onParseError: failLoad,
    onReadError: failLoad,
  })

  // 任一对话框在开（终审修复）：备注快捷键守卫——互斥期/已开时不再开；ref 渲染期同步供只绑一次闭包读，state 供浮动条隐藏
  // v2.5：切换浮层（搜索/轮换）同列互斥；轮换中的 Tab 由 useQuickSwitch 捕获接管不经此守卫
  const anyDialog = guard.guarding || flow.confirming || exportFlow.open || noteEdit.open || quick.switchOpen || quick.cycle !== null
  const anyDialogRef = useRef(false)
  anyDialogRef.current = anyDialog
  // 快捷键（Ctrl+S / Ctrl+C 复制 md / 备注编辑 Shift+F2、Ctrl+. / 切换 Ctrl+P、Ctrl+Tab）拆至 useEditorHotkeys（验收轮，行数护栏）
  useEditorHotkeys({
    doCopy,
    explicitSave,
    openNoteDialog: noteEdit.openNoteDialog,
    activeUidRef: selection.activeUidRef,
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

  if (state === 'loading') return <div className="editor-loading">正在打开…</div>

  if (state === 'error' && errorInfo)
    return <EditorErrorPanel error={errorInfo.error} raw={errorInfo.raw} mdPath={mdPath} onRawEdit={openInEditor} />

  return (
    <div className="editor"><TooltipProvider>
      <div className="canvas-host">
        {engineTree && (
          <MindMapCanvas
            key={mdPath}
            tree={engineTree}
            registry={registry}
            layout={layoutToEngine(initialLayout)}
            theme={engineThemeName(resolvedTheme)}
            onReady={(mm) => {
              mmRef.current = mm
              // 连线净化（M5d Task 2）：等首帧渲染后建注册表 → 剥离显示文本 → 按注册表落初始连线
              purify(mm)
              undoRedo.bind(mm) // 回退/重做（v1.1）：订阅 back_forward 历史态（基线种子随净化尾部播入）
            }}
            onDataChange={(data) => {
              stats.onDataChange(data) // 统计行（2026-09）：携带快照时重数节点
              pipeline.onTreeDataChange(data)
            }}
            onActiveChange={selection.handleActiveChange}
            onEditorPaste={(raw) => applyMultilinePaste(mmRef.current, selection.activeUidRef.current, raw)}
            // 快捷键对调：Control+Shift+c 画布内复制节点成功 → 贴选中节点盖「已复制为节点」墨青印
            onNodeCopy={() => flashCopy('copied-node')}
          />
        )}
      </div>
      {/* 选中节点浮动条（验收轮）：备注笔 + 连线箭头，免记快捷键；对话框开时隐藏，建线态由 hook 内避让 */}
      {nodePos && !anyDialog && (
        <NodeActions
          pos={nodePos}
          onNoteClick={noteEdit.openNoteDialog}
          onLinkClick={() => startLinkFromActive(mmRef.current)}
          onIconClick={() =>
            iconPick.openPicker(nodeTextOf(mmRef.current, selection.activeUidRef.current), nodeIconsOf(mmRef.current, selection.activeUidRef.current))
          }
          onImageClick={() =>
            imageEdit.openDialog(nodeTextOf(mmRef.current, selection.activeUidRef.current), nodeImageOf(mmRef.current, selection.activeUidRef.current))
          }
        />
      )}
      {/* 浮动砚栏（M5a 拆分至 ZenBar）：静置淡化，悬停/聚焦浮现（spec §4.4 UI 隐身） */}
      <ZenBar
        onBack={() => void quick.leaveTo(backToLibrary)} // 失败/确认挂起：留在编辑器（确认后仅落盘，不自动导航）
        onSwitchClick={quick.open}
        undoRedo={undoRedo}
        onCopyClick={doCopy}
        onCopyPathClick={copyPath}
        scope={selection.activeUid ? 'branch' : 'full'}
        onSaveClick={() => void explicitSave()}
        onNoteClick={noteEdit.openNoteDialog}
        noteEnabled={selection.activeUid !== null}
        onExportClick={exportFlow.openExport}
        onZoomOut={() => mmRef.current?.view.narrow()}
        onZoomIn={() => mmRef.current?.view.enlarge()}
        onCenterRoot={() => mmRef.current && centerRoot(mmRef.current)}
        onFit={() => mmRef.current && fitView(mmRef.current)}
        layout={layout}
        onSwitchLayout={switchLayout}
      />
      {/* 印记（Task 7）：显式保存成功朱砂印 / 复制成功墨青印，右上角闪现 1.2s（自动保存静默不印记）。
          key=seq 使重复盖印强制重挂载；onDone 到期受控卸载（置 null），否则旧 state 残留令后续同值盖印失效 */}
      {stamp && <SaveStamp key={stamp.seq} kind={stamp.kind} onDone={() => setStamp(null)} />}
      {/* 复制印记：贴目标节点上方闪现（视线在操作处）；几何缺失时 flashCopy 已兜底走右上角，此处只渲染锚定版 */}
      {copyStamp && (
        <CopyStamp key={copyStamp.seq} kind={copyStamp.kind} pos={{ left: copyStamp.left, top: copyStamp.top }} onDone={() => setCopyStamp(null)} />
      )}
      {/* 左下题签 + 朱砂脏印 + 统计行；右下主题钮（M5a 拆分至 EditorCaption）；
          复制文件路径钮在砚栏复制 md 钮旁（IconRoute 区分） */}
      <EditorCaption name={name} dirty={dirty} nodeCount={stats.nodeCount} savedAt={stats.savedAt} />
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
        // 备注框同样让位互斥（guarding > confirming 优先级同上）
        noteDraft={!guard.guarding && !flow.confirming ? noteEdit.noteDraft : null}
        onNoteSave={noteEdit.saveNote}
        onNoteCancel={noteEdit.cancelNote}
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
        // 快速切换浮层（v2.5）：搜索态（Ctrl+P，输入过滤高亮自管）/ 轮换态（Ctrl+Tab 按住，
        // 受控高亮无输入框）两形态互斥共用——cycleActive 传 undefined 即搜索态
        quickSwitch={
          !guard.guarding && !flow.confirming && (quick.switchOpen || quick.cycle !== null)
            ? {
                candidates: quick.cycle !== null ? quick.cycleCandidates : quick.candidates,
                cycleActive: quick.cycle ?? undefined,
                onActiveChange: quick.setCycleActive,
                onPick: (p) => void quick.switchTo(p),
                onClose: quick.cycle !== null ? quick.cancelCycle : quick.close,
              }
            : null
        }
      />
    </TooltipProvider></div>
  )
}
