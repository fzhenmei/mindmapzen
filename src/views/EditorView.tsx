import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, findSubtreeByUid, parse, serialize, zenToEngineTree } from '../services/mdTree'
import { buildImageMeta } from '../services/imageAssets'
import { readSidecar } from '../services/sidecar'
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
import { startLinkFromActive, useNodeActions } from '../hooks/useNodeActions'
import { useIconPicker, nodeIconsOf, nodeTextOf } from '../hooks/useIconPicker'
import { useImageEdit, nodeImageOf } from '../hooks/useImageEdit'
import IconPickerDialog from '../components/IconPickerDialog'
import ImageDialog from '../components/ImageDialog'
import EditorCaption from '../components/EditorCaption'
import { TooltipProvider } from '../components/ui/tooltip'
import NodeActions from '../components/NodeActions'
import EditorDialogs from '../components/EditorDialogs'
import IgnoredBlocksBanner from '../components/IgnoredBlocksBanner'
import SaveStamp from '../components/SaveStamp'
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
  const [stamp, setStamp] = useState<{ kind: 'saved' | 'copied'; seq: number } | null>(null) // 印记：显式保存/复制成功后闪现 1.2s；seq 每次触发自增，作 SaveStamp 的 key 强制重挂载
  const stampSeqRef = useRef(0) // 印记序号：每次盖印自增，key 变化强制重挂载（重置 1.2s 计时，且不因旧印记未卸载而失效）

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  // 连线净化（M5d Task 2）：会话注册表（uid → 目标名）序列化注入/画线桥接/复制共享；setLinkAdjust（Task 5）注入 sidecar 弯曲记忆
  const { registry, purify, rebuildFromRegistry, setLinkAdjust } = useLinkPurify(mmRef)

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
    onSaved: rebuildFromRegistry, // 落盘后按注册表重建双链（M5d：显示文本已剥离，注册表是连线数据源）
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
  const flashStamp = (kind: 'saved' | 'copied'): void => {
    stampSeqRef.current += 1
    setStamp({ kind, seq: stampSeqRef.current })
  }

  // 导出与复制为图片（M5b 拆出）：对话框状态与三入口执行链（行数护栏）；端口经 props 注入
  const exportFlow = useExportFlow(mmRef, adapter, name, exportPorts, flashStamp, setError)

  /** 复制范围解析：有选中节点→该 uid 子树（从 H1 重计层级）；否则整图。陈旧 uid 兜底：未命中渲染树
   *  （如撤销删除）时清选中回退整图。后处理按 settings 剥备注引用块/双链括号（getState 取实时值） */
  const doCopy = async (): Promise<void> => {
    try {
      const mm = mmRef.current
      if (!mm) return
      const full = mm.getData()
      selection.clearStaleIfMissing(full)
      const uid = selection.activeUidRef.current
      const active = uid ? findSubtreeByUid(full, uid) : null
      await writeClipboard(applyCopySettings(serialize(engineTreeToZen(active ?? full).tree, registry.byUid), useAppStore.getState().settings))
      flashStamp('copied')
    } catch (e) {
      setError('复制失败：' + String(e))
    }
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

  // 关闭守卫（M5a 拆分）：拦截注册/三态选择/防误触；保存分支走上面 explicitSave 组合，对话框渲染留本视图
  const guard = useCloseGuard({ registerCloseGuard, exitApp, dirtyRef, explicitSave, clearDirty })

  useEffect(() => {
    dirtyRef.current = false
    let cancelled = false
    ;(async () => {
      try {
        const raw = await adapter.readTextFile(mdPath)
        const r = parse(raw)
        if (cancelled) return
        if (!r.ok) {
          setState('error')
          setErrorInfo({ error: r.error, raw })
          return
        }
        const sc = await readSidecar(adapter, mdPath)
        if (cancelled) return
        flow.setFromParse(r.ignoredBlocks)
        setLinkAdjust(sc?.linkAdjust ?? {}) // M5d Task 5：弯曲记忆随净化入口恢复（须先于 onReady purify）
        // sidecar.layout 三处同步（挂载初值/激活态/保存引用，spec §3.7 打开恢复）；无 sidecar 回退用户偏好布局
        const initial = sc?.layout ?? useAppStore.getState().preferredLayout
        setInitialLayout(initial)
        setLayout(initial)
        layoutRef.current = initial
        // 插图元数据（M19）：src→dataURL+尺寸（失败宽容跳过），引擎 imgMap 渲染；
        // 编辑器路由必在工作区内（类型上防御空值）
        const imgMeta =
          workspaceDir !== null ? await buildImageMeta(adapter, workspaceDir, r.tree) : undefined
        if (cancelled) return
        setEngineTree(zenToEngineTree(r.tree, new Set(sc?.collapsed ?? []), '', imgMeta))
        setState('ready')
      } catch (e) {
        // 读文件失败（如已被移动/删除）与解析失败走同一错误面板
        if (cancelled) return
        setState('error')
        setErrorInfo({
          error: `无法读取文件（可能已被移动或删除）：${e instanceof Error ? e.message : String(e)}`,
          raw: '',
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 文档内容由父组件 key 重挂载切换
  }, [])

  // 任一对话框在开（终审修复）：备注快捷键守卫——互斥期/已开时不再开；ref 渲染期同步供只绑一次闭包读，state 供浮动条隐藏
  const anyDialog = guard.guarding || flow.confirming || exportFlow.open || noteEdit.open
  const anyDialogRef = useRef(false)
  anyDialogRef.current = anyDialog
  // 快捷键（Ctrl+S / Ctrl+Shift+C / 备注编辑 Shift+F2、Ctrl+.）拆至 useEditorHotkeys（验收轮，行数护栏）
  useEditorHotkeys({
    doCopy,
    explicitSave,
    openNoteDialog: noteEdit.openNoteDialog,
    activeUidRef: selection.activeUidRef,
    anyDialogRef,
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

  if (state === 'error' && errorInfo) {
    return (
      <div className="editor-error">
        <h2>无法打开此导图</h2>
        <p className="error-detail">{errorInfo.error}</p>
        <pre className="raw-preview">{errorInfo.raw}</pre>
        <button type="button" data-testid="btn-raw-edit" onClick={() => openInEditor(mdPath)}>
          以纯文本打开修复
        </button>
      </div>
    )
  }

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
            onDataChange={pipeline.onTreeDataChange}
            onActiveChange={selection.handleActiveChange}
            onEditorPaste={(raw) => applyMultilinePaste(mmRef.current, selection.activeUidRef.current, raw)}
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
        onBack={async () => {
          pipeline.clearPendingAutosave()
          if (await explicitSave()) await backToLibrary() // 失败/确认挂起：留在编辑器（确认后仅落盘，不自动导航）
        }}
        undoRedo={undoRedo}
        onCopyClick={() => void doCopy()}
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
      {/* 左下题签 + 朱砂脏印；右下主题钮（M5a 拆分至 EditorCaption） */}
      <EditorCaption name={name} dirty={dirty} />
      {/* 忽略块横幅改挂砚栏下方（.zen-banner 浮于画布）——既有结构照搬，仅换容器类（Task 6 迁移） */}
      {flow.ignored.length > 0 && <IgnoredBlocksBanner blocks={flow.ignored} />}
      {/* 对话框互斥约定（ui Dialog）：本视图至多同时一个对话框——guarding 优先于 flow.confirming
          （守卫先收起、确认框随即接管，故 !guarding 门闩）；两框 JSX 已迁 EditorDialogs（M5b Task 1） */}
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
      />
      {/* 图标管理器（M18）：互斥优先级同上（guarding > confirming > 图标） */}
      {iconPick.open && !guard.guarding && !flow.confirming && (
        <IconPickerDialog
          nodeText={iconPick.nodeText}
          current={iconPick.icons}
          onCancel={iconPick.close}
          onConfirm={iconPick.apply}
        />
      )}
      {/* 插图（M19 + 粘贴截图）：互斥优先级同上 */}
      {imageEdit.open && !guard.guarding && !flow.confirming && (
        <ImageDialog
          nodeText={imageEdit.nodeText}
          current={imageEdit.current}
          preview={imageEdit.preview}
          pasteError={imageEdit.pasteError}
          onPick={() => void imageEdit.pickAndApply()}
          onPaste={(image) => void imageEdit.pasteAndApply(image)}
          onPasteClick={() => void imageEdit.pasteFromClipboard()}
          onRemove={imageEdit.remove}
          onCancel={imageEdit.close}
        />
      )}
    </TooltipProvider></div>
  )
}
