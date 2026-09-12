import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useChatStore } from '../store/chatStore'
import { useSubtreeCopy } from '../hooks/useSubtreeCopy'
import { applyMultilinePaste } from '../services/multiline'
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
import { useIconPicker, findByUid, nodeIconsOf, nodeTextOf } from '../hooks/useIconPicker'
import { useTagPicker, nodeTagsOf, usedTagsOf } from '../hooks/useTagPicker'
import { useImageEdit, nodeImageOf } from '../hooks/useImageEdit'
import EditorCaption from '../components/EditorCaption'
import EditorCanvasArea, { type OpenFailInfo } from './EditorCanvasArea'
import KanbanView from './KanbanView'
import type { TaskStatus } from '../services/statusMarkers'
import { expandToUid, execOnRenderNode, mergeStatusBadge, nodeStatusOf } from '../services/statusOps'
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
import WarnStamp from '../components/WarnStamp'
import ZenBar from '../components/ZenBar'
import ChatPanel, { AI_PANEL_DEFAULT_PX } from '../components/ChatPanel'
import AiTurnBadge from '../components/AiTurnBadge'
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
  // 视图模式（2026-09 看板模式）：导图 ⇄ 看板浮层（内存态在 appStore，重启恒回导图）
  const viewMode = useAppStore((s) => s.viewMode)
  // 复制选项（2026-09 自设置面板移入砚栏复制钮下拉）：订阅驱动勾选态；doCopy 路径仍 getState 实时取
  const copySettings = useAppStore((s) => s.settings)
  // AI 面板（2026-09 AI Agent v1）：配置订阅（入口显隐）+ 落盘宽（默认 null = 320）
  const aiConfig = useAppStore((s) => s.aiConfig)
  const aiChatWidth = useAppStore((s) => s.aiChatWidth)
  // AI 回合锁定（Task 12，spec §6）：回合期间（非 idle）切图拦截/状态签/编辑菜单禁用
  const aiPhase = useChatStore((s) => s.phase)
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
  const [warnStamp, setWarnStamp] = useState<{ seq: number } | null>(null) // 警告印记（2026-09-09）：无目标正文编辑 1.2s 居中劝导（seq 重挂载语义同上）
  const warnSeqRef = useRef(0)
  const [newMapOpen, setNewMapOpen] = useState(false) // 新建导图对话框（2026-09 画布内入口）：复用案头 NewMapDialog，确认走 leaveTo 安全链
  // 状态选择器目标快照（2026-09 看板模式 Task 8）：开框瞬间的 uid/文本/现态；null = 关
  const [statusPick, setStatusPick] = useState<{ uid: string; text: string; current: TaskStatus | null } | null>(null)
  const [aiOpen, setAiOpen] = useState(false) // AI 对话面板开合（2026-09 AI Agent v1）：右栏常驻槽
  const [aiDragPx, setAiDragPx] = useState<number | null>(null) // AI 面板拖拽暂存宽；null = 未在拖（松手 onCommit 落盘）

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
  // 正文角标悬停 uid（2026-09-09）：热键 Shift+F2 悬停优先编辑被预览节点；null = 退场回落选中
  const noteHoverUidRef = useRef<string | null>(null)
  /** 正文编辑入口守卫（2026-09-09）：悬停/选中皆空且弹窗未开 → 盖居中警告签（WarnStamp），
   *  不弹无关联空态弹窗；有目标或开着（toggle 关闭语义）→ 照常 toggle。热键与砚栏/浮条
   *  两按钮入口共走此口 */
  const toggleBodyOrWarn = (uid: string | null): void => {
    if (!uid && !selection.activeUidRef.current && !bodyDialog.open) {
      warnSeqRef.current += 1
      setWarnStamp({ seq: warnSeqRef.current })
      return
    }
    bodyDialog.toggle(uid)
  }
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

  /** 视图切换（2026-09 看板模式）：同值 no-op——砚栏视图组、快捷键翻转与看板关闭钮共用 */
  const switchView = (v: 'mindmap' | 'kanban'): void => {
    if (v === viewMode) return
    useAppStore.getState().setViewMode(v)
  }

  /** 回导图定位（看板 → 导图）：切视图 + 展开收起祖先 + 居中聚焦。引擎 findNodeByUid 查
   *  渲染树，收起子树的节点不在其中——展开复用 statusOps.expandToUid（expand 直写不进
   *  undo：视图导航豁免，非内容编辑），展开后经 node_tree_render_end 一次性回调在新树上
   *  寻址居中（回调内自兜 try/catch：引擎事件异常运行时只静默吞）；定位是非关键路径，
   *  异常 console.error 显式出口，不阻塞看板使用 */
  const locateNode = (uid: string): void => {
    switchView('mindmap')
    const mm = mmRef.current
    if (mm === null) return
    const apply = (): void => {
      const node = mm.renderer?.findNodeByUid(uid)
      if (node !== null && node !== undefined) mm.renderer?.moveNodeToCenter?.(node as never)
      else console.warn('看板定位未命中渲染节点，跳过居中', uid)
    }
    try {
      if (expandToUid(mm, uid)) {
        mm.on('node_tree_render_end', function onEnd() {
          mm.off('node_tree_render_end', onEnd)
          try {
            apply()
          } catch (e) {
            console.error('看板定位回调失败', e)
          }
        })
      } else {
        apply() // 路径已全展开：渲染树可即时寻址
      }
    } catch (e) {
      console.error('看板回导图定位失败', e)
    }
  }

  /** 应用状态（2026-09 看板模式 Task 8，StatusPickerDialog 确认）：确认即关框；经
   *  execOnRenderNode 渲染节点寻址落 setIcon（SET_NODE_ICON 单命令可撤销，KanbanView.
   *  changeStatus 同款链路）。currentIcon 从数据树读（getData 快照含收起隐藏子树，
   *  收起分支节点照常可改）；onTreeDataChange 在命令真正落地后调用（照 useIconPicker.apply
   *  修复模式——渲染树 miss 时先展开重试，回调外调用会误置脏）。同态短路：重选当前态
   *  不产生命令（不占 undo 一步、不置脏，看板侧同款纪律） */
  const applyStatus = (uid: string, status: TaskStatus | null): void => {
    const mm = mmRef.current
    setStatusPick(null)
    if (mm === null) return
    if (nodeStatusOf(mm, uid) === status) return
    const currentIcon = findByUid(mm.getData(), uid)?.data.icon
    execOnRenderNode(mm, uid, '改状态', (node) => {
      ;(node as { setIcon?(icons: string[]): void })?.setIcon?.(mergeStatusBadge(currentIcon, status))
      pipeline.onTreeDataChange()
    })
  }

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

  /** 复制 md 管线（2026-09 子树卡片拆至 useSubtreeCopy，行数护栏同 useExportFlow 动因）：
   *  整图/选中子树的 doCopy + 看板卡片的 copyKanbanCard 共用「子树→md→剪贴板」公共管线
   *  （剥正文/双链括号后处理/图片绝对化/失败横幅/印记，语义注释见该 hook） */
  const { doCopy, copyKanbanCard } = useSubtreeCopy({
    mmRef, writeClipboard, registry, selection, flashCopy, setError,
  })

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

  /** AI 回合期间拦截切图/新建（spec §6）：状态签脉冲提示，主出路是面板停止钮 */
  const guardAiTurn = (next: () => void): void => {
    if (useChatStore.getState().phase !== 'idle') {
      useChatStore.getState().notifyBlocked()
      return
    }
    next()
  }

  // 顶部条取色令牌（v2.5）：编辑器全屏画布顶部是 --background，挂载即声明（TitleBar 换底色）
  useEffect(() => useAppStore.setState({ titlebarBg: '--background' }), [])

  /** 关闭请求先冲正文防抖草稿（终审 I2）：干净图防抖窗内直接关窗（Alt+F4/点 X）时
   *  dirty 未及置（data_change 经引擎节流异步），返回「是否有草稿被冲」供守卫按三态处理 */
  const flushPending = (): boolean => {
    if (!bodyDialog.hasPending()) return false
    bodyDialog.flushNow()
    return true
  }

  // 关闭守卫（M5a 拆分）：拦截注册/三态选择/防误触；保存分支走上面 explicitSave 组合，对话框渲染留本视图。
  // AI 回合关窗锁（Task 12，spec §6）：回合期间 preventClose + 状态签脉冲，不走三态框
  const guard = useCloseGuard({
    registerCloseGuard,
    exitApp,
    dirtyRef,
    explicitSave,
    clearDirty,
    flushPending,
    blockClose: () => useChatStore.getState().phase !== 'idle',
    onBlocked: () => useChatStore.getState().notifyBlocked(),
  })

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
    // 悬停优先 + 无目标守卫：悬停在场编辑被预览节点；悬停/选中皆空盖警告签不弹空态弹窗
    toggleBodyDialog: () => toggleBodyOrWarn(noteHoverUidRef.current),
    anyDialogRef,
    // AI 回合拦呼出（Task 12 fix，spec §6）：Ctrl+P 搜索浮层 / Ctrl+Tab 轮换浮层回合中
    // 均不开——open 即被拦，commit 路径自然封死（无需改 useQuickSwitch 内部）
    openQuickSwitch: () => guardAiTurn(quick.open),
    cycleStep: (reverse: boolean) => guardAiTurn(() => quick.cycleStep(reverse)),
    // 视图切换（2026-09 看板模式）：getState 读现值翻转——监听只绑一次（首渲染闭包），
    // 订阅值会陈旧，getState 恒新；看板不涉 AI 回合锁（不切图不写盘，纯视图态）
    toggleViewMode: () => {
      const v = useAppStore.getState().viewMode
      useAppStore.getState().setViewMode(v === 'kanban' ? 'mindmap' : 'kanban')
    },
  })

  useEffect(() => {
    return () => {
      pipeline.unmountFlush()
      useChatStore.getState().reset() // AI 会话内存态（spec §7）：切图/关闭即清空（切图经 App key 重挂本视图，同点覆盖）
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount 冲刷，saveNow 依赖 refs
  }, [])

  // AI 面板开/关/定宽后画布让位重算：引擎只监听 window resize，容器收窄（canvas-host 内联 right）
  // 须宿主补调 resize()；拖拽暂存不进依赖——不逐帧重排，开合/onCommit/onReset 各触发一次。
  // 补偿调用必须复刻 MindMapCanvas safeResize 的 0×0 门禁（rect 校验+try/catch）：引擎
  // getElRectInfo 先写 0 再抛错——窄窗口（tauri 无 minWidth）面板开/定宽时 canvas-host 宽
  // 可 ≤0，裸 resize 会命中"先污染后抛错"链路（2026-09 全树平移事故，见 webview2-zero-resize-corruption）
  useEffect(() => {
    const el = mmRef.current?.el
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return // 0×0 门禁：跳过本次补偿，窗口恢复后 focus/resize 自愈
    try {
      mmRef.current?.resize()
    } catch (e) {
      console.warn('AI 面板画布补偿 resize 失败（窗口尺寸异常，暂跳过）', e) // 显式出口
    }
  }, [aiOpen, aiChatWidth])

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

  // AI 面板派生（spec §1/§7）：未配置隐藏入口；面板宽 = 拖拽暂存 ?? 落盘值 ?? 默认；
  // 上下文节点按现选中组装（恰单选），供 chip 展示与"这个节点"指代上行
  const aiConfigured = aiConfig.baseUrl !== '' && aiConfig.apiKey !== '' && aiConfig.model !== ''
  const aiPanelPx = aiDragPx ?? aiChatWidth ?? AI_PANEL_DEFAULT_PX
  const aiSelectionNode = selection.activeUid ? { uid: selection.activeUid, text: nodeTextOf(mmRef.current, selection.activeUid) } : null

  // @container：停泊栏避让的查询容器（UI评审P1，题签/主题钮 @max-[1150px] 上移基准）。
  // 2026-09-08 弹窗化：画布让位（.body-open 收窄右缘 + 延迟 resize）随常驻面板退役——
  // 模态弹窗浮于画布上，画布宽度恒定不再重排
  return (
    <div className="editor @container"><TooltipProvider>
      {/* AI 面板让位（2026-09 AI Agent v1）：开时 canvas-host 右缘内收面板宽（引擎容器真收窄，
          非浮层遮挡——节点不漫游进面板下方）；关时恢复原 5px 留缝 */}
      <div className="canvas-host" style={aiOpen ? { right: aiPanelPx } : undefined}>
        <EditorCanvasArea
          state={state}
          errorInfo={errorInfo}
          mdPath={mdPath}
          openInEditor={openInEditor}
          onBack={() => guardAiTurn(() => void quick.leaveTo(backToLibrary))}
          onSwitch={() => guardAiTurn(quick.open)}
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
          onActiveChange={(uids) => {
            selection.handleActiveChange(uids)
            // AI 上下文上行（spec §7）：恰单选组 { uid, text } 写 chatStore（chip + 指代同源）；
            // 清选/多选置 null——多选无单值语义，不给 AI 假上下文
            useChatStore.getState().setContextNode(
              uids.length === 1 ? { uid: uids[0]!, text: nodeTextOf(mmRef.current, uids[0]!) } : null,
            )
          }}
          onNoteHover={(uid) => { noteHoverUidRef.current = uid }}
          onPaste={(raw) => applyMultilinePaste(mmRef.current, selection.activeUidRef.current, raw)}
          {...canvasPaste}
          // 快捷键对调：Control+Shift+c 画布内复制节点成功 → 贴选中节点盖「已复制为节点」墨青印
          onNodeCopy={() => flashCopy('copied-node')}
        />
        {/* AI 处理中状态签（Task 12，spec §7）：canvas-host（absolute 定位）直接子级——
            落画布区右上角、不随引擎缩放平移；面板开时 canvas-host 右缘内收，签同步让位不被遮 */}
        <AiTurnBadge />
        {/* 看板浮层（2026-09 看板模式）：不卸载引擎画布（防 0×0 resize 污染 + 保 undo 栈 +
            免重挂净化链），不透明浮层盖满 canvas-host；关闭即卸载浮层本体。挂载门含 docReady
            ——引擎未就绪时 mmRef 为 null，卡片读写无处落 */}
        {docReady && viewMode === 'kanban' && (
          <KanbanView
            mmRef={mmRef}
            onDataChanged={() => pipeline.onTreeDataChange()}
            onOpenBody={(uid) => bodyDialog.toggle(uid)}
            // picker 桥接（Task 6 审查预警 A）：看板卡片非画布选中节点，openPicker 显式
            // 传卡片 uid；used 取全图已用标签（usedTagsOf 全量口径，与画布入口一致）
            onEditIcons={(c) => iconPick.openPicker(c.text, c.icons, c.uid)}
            onEditTags={(c) => tagPick.openPicker(c.text, c.tags, usedTagsOf(mmRef.current), c.uid)}
            onLocate={locateNode}
            onCopyCard={copyKanbanCard}
            onClose={() => switchView('mindmap')}
          />
        )}
      </div>
      {/* AI 对话面板入口（2026-09 AI Agent v1，spec §1）：未配置隐藏；面板开时让位（关闭钮在面板头）。
          贴窗口右缘竖条，上下居中；fixed 定位不占布局 */}
      {!aiOpen && aiConfigured && (
        <button
          type="button"
          data-testid="ai-toggle"
          aria-label={t('ai.toggle')}
          title={t('ai.toggle')}
          onClick={() => setAiOpen(true)}
          className="fixed top-8 bottom-0 right-0 z-30 my-auto flex h-12 w-6 items-center justify-center rounded-l-lg border border-r-0 border-sidebar-border bg-background shadow-md hover:bg-accent"
        >
          <Sparkles className="size-3.5 text-muted-foreground" />
        </button>
      )}
      {/* AI 对话面板（spec §7）：右栏贴边常驻（absolute inset-y 全高），宽 = 拖拽暂存（每帧）→
          松手 onCommit 落盘（setAiChatWidth）→ 双击 onReset 回默认；拖拽手柄在 ChatPanel 左缘 */}
      {aiOpen && (
        <div className="absolute inset-y-0 right-0 z-20 flex" style={{ width: aiPanelPx }}>
          <ChatPanel
            mmRef={mmRef}
            selection={aiSelectionNode}
            width={aiPanelPx}
            onResize={setAiDragPx}
            onCommit={(w) => {
              setAiDragPx(null)
              void useAppStore.getState().setAiChatWidth(w)
            }}
            onReset={() => {
              setAiDragPx(null)
              void useAppStore.getState().setAiChatWidth(null)
            }}
            onClose={() => setAiOpen(false)}
          />
        </div>
      )}
      {/* 顶部导图胶囊条（2026-09 鼠标流切换）：最近打开常驻平铺，点选走安全链；仅一张时
          组件内不渲染。悬浮顶部居中（悬浮停泊同 ZenBar——canvas-host 恒满屏，引擎零配合） */}
      <MapTabs tabs={quick.mapTabCandidates} currentMdPath={mdPath} onPick={(p) => guardAiTurn(() => void quick.switchTo(p))} />
      {/* 空图引导（2026-09 UI 评审 P2-2）：仅根节点时的建节点快捷键提示，条件与动机见组件注释 */}
      {docReady && <CanvasHint tree={engineTree} nodeCount={stats.nodeCount} />}
      {/* 选中节点浮动条（验收轮）：正文笔 + 连线箭头等，免记快捷键；对话框开时隐藏，建线态由 hook 内避让 */}
      {nodePos && !anyDialog && (
        <NodeActions
          pos={nodePos}
          onBodyClick={() => toggleBodyOrWarn(null)}
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
          // 状态选择器（2026-09 看板模式 Task 8）：快照现态开框；确认走 applyStatus
          onStatusClick={() => {
            const uid = selection.activeUidRef.current
            if (uid) {
              setStatusPick({ uid, text: nodeTextOf(mmRef.current, uid), current: nodeStatusOf(mmRef.current, uid) })
            }
          }}
          onImageClick={() =>
            imageEdit.openDialog(nodeTextOf(mmRef.current, selection.activeUidRef.current), nodeImageOf(mmRef.current, selection.activeUidRef.current))
          }
        />
      )}
      {/* 多选浮条（2026-09 圈选批量操作）：圈选/Ctrl 多选 >1 节点时出现于砚栏上方，计数 + 批量删除
          （REMOVE_NODE 删全部激活节点及子树，一条撤销记录）。单选时 activeUid 退化为 null，
          上方 NodeActions 已隐藏，两者互斥不并现 */}
      {selection.activeCount > 1 && !anyDialog && (
        <MultiSelectBar count={selection.activeCount} onDelete={() => mmRef.current?.execCommand('REMOVE_NODE')} deleteDisabled={aiPhase !== 'idle'} />
      )}
      {/* 浮动砚栏（M5a 拆分至 ZenBar）。仅就绪态渲染（2026-09）：错误/加载态引擎未建，按钮无意义 */}
      {docReady && (
      <ZenBar
        onBack={() => guardAiTurn(() => void quick.leaveTo(backToLibrary))} // 失败/确认挂起：留在编辑器（确认后仅落盘，不自动导航）；AI 回合拦截（Task 12 fix）
        onSwitchClick={() => guardAiTurn(quick.open)}
        onNewClick={() => setNewMapOpen(true)}
        undoRedo={undoRedo}
        onCopyClick={doCopy}
        copySettings={copySettings}
        onToggleCopySetting={(key) => void useAppStore.getState().setSetting(key, !copySettings[key])}
        onCopyPathClick={copyPath}
        scope={selection.activeUid ? 'branch' : 'full'}
        onSaveClick={() => void explicitSave()}
        onBodyClick={() => toggleBodyOrWarn(null)}
        bodyActive={bodyDialog.open}
        onExportClick={exportFlow.openExport}
        onZoomOut={() => mmRef.current?.view.narrow()}
        onZoomIn={() => mmRef.current?.view.enlarge()}
        onCenterRoot={() => mmRef.current && centerRoot(mmRef.current)}
        onFit={() => mmRef.current && fitView(mmRef.current)}
        layout={layout}
        onSwitchLayout={switchLayout}
        viewMode={viewMode}
        onSwitchView={switchView}
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
      {/* 警告印记：无目标正文编辑居中劝导（2026-09-09），key/seq 重挂载与到期卸载同上 */}
      {warnStamp && <WarnStamp key={warnStamp.seq} onDone={() => setWarnStamp(null)} />}
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
        // 状态选择器（2026-09 看板模式 Task 8）：导图侧状态入口，互斥优先级同上
        statusPicker={
          statusPick !== null && !guard.guarding && !flow.confirming
            ? {
                nodeText: statusPick.text,
                current: statusPick.current,
                onCancel: () => setStatusPick(null),
                onConfirm: (status) => applyStatus(statusPick.uid, status),
              }
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
        quickSwitch={buildQuickSwitchSlot(guard, flow, quick, guardAiTurn)}
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
                  // AI 回合拦截（Task 12，spec §6）：leaveTo 会先保存再切图，整链包进
                  // guardAiTurn——回合期间不保存不切图，状态签脉冲提示（主出路：面板停止钮）
                  guardAiTurn(() => {
                    void quick
                      .leaveTo(() => useAppStore.getState().createAndOpen(name, templateContent))
                      .catch((e) => setError(t('errors.createMapFailed', { reason: e instanceof Error ? e.message : String(e) })))
                  })
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
 *  两形态互斥共用——cycleActive 传 undefined 即搜索态；守卫/确认框让位互斥（同其他槽）。
 *  onPick 经 guardAiTurn 包装（Task 12 fix，spec §6）：浮层开着进入 AI 回合时 commit 仍拦 */
function buildQuickSwitchSlot(
  guard: Readonly<{ guarding: boolean }>,
  flow: Readonly<{ confirming: boolean }>,
  quick: ReturnType<typeof useQuickSwitch>,
  guardAiTurn: (next: () => void) => void,
): ComponentProps<typeof QuickSwitchDialog> | null {
  if (guard.guarding || flow.confirming) return null
  if (!quick.switchOpen && quick.cycle === null) return null
  return {
    candidates: quick.cycle !== null ? quick.cycleCandidates : quick.candidates,
    cycleActive: quick.cycle ?? undefined,
    onActiveChange: quick.setCycleActive,
    onPick: (p) => guardAiTurn(() => void quick.switchTo(p)),
    onClose: quick.cycle !== null ? quick.cancelCycle : quick.close,
  }
}
