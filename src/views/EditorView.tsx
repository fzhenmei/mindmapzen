import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, findSubtreeByUid, parse, serialize, zenToEngineTree } from '../services/mdTree'
import { readSidecar } from '../services/sidecar'
import { splitMultilineText } from '../services/multiline'
import { resolveAllLinks } from '../services/links'
import type { WriteClipboard } from '../services/clipboard'
import MindMapCanvas from '../editor/MindMapCanvas'
import { engineThemeName } from '../editor/engineThemes'
import { layoutToEngine, type LayoutKind } from '../editor/layoutMap'
import { centerRoot, fitView } from '../editor/viewOps'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { RegisterCloseGuard } from '../types/ports'
import { useSavePipeline } from '../hooks/useSavePipeline'
import { useIgnoredFlow } from '../hooks/useIgnoredFlow'
import { useCloseGuard } from '../hooks/useCloseGuard'
import { useActiveSelection } from '../hooks/useActiveSelection'
import { useNoteEdit } from '../hooks/useNoteEdit'
import EditorCaption from '../components/EditorCaption'
import EditorDialogs from '../components/EditorDialogs'
import IgnoredBlocksBanner from '../components/IgnoredBlocksBanner'
import SaveStamp from '../components/SaveStamp'
import ZenBar from '../components/ZenBar'

interface Props {
  mdPath: string
  openInEditor: (path: string) => void
  /** 剪贴板写入端口：生产为 Tauri 插件实现，测试注入内存实现 */
  writeClipboard: WriteClipboard
  /** 关闭守卫注册端口：生产为 Tauri onCloseRequested，测试注入捕获桩 */
  registerCloseGuard: RegisterCloseGuard
  /** 退出应用端口：生产为 getCurrentWindow().destroy()，测试记录调用 */
  exitApp: () => void
}

export default function EditorView({ mdPath, openInEditor, writeClipboard, registerCloseGuard, exitApp }: Readonly<Props>) {
  const { adapter, markDirty, clearDirty, backToLibrary, setError } = useAppStore()
  const dirty = useAppStore((s) => s.dirty)
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  const mmRef = useRef<MindMapHandle | null>(null)
  const dirtyRef = useRef(false)
  const layoutRef = useRef<LayoutKind>('mindmap') // 保存时写入 sidecar.layout 的真实值
  // 布局双状态（spec §3.7）：initialLayout 是画布挂载期布局（引擎构造参数，只来自打开时的 sidecar）；
  // layout 是当前激活布局（按钮点亮）——运行切换走 setLayout 即时重排、不重挂载，故 switchLayout 只动 layout/layoutRef
  const [layout, setLayout] = useState<LayoutKind>('mindmap')
  const [initialLayout, setInitialLayout] = useState<LayoutKind>('mindmap')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<{ error: string; raw: string } | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)
  const [stamp, setStamp] = useState<{ kind: 'saved' | 'copied'; seq: number } | null>(null) // 印记：显式保存/复制成功后闪现 1.2s；seq 每次触发自增，作 SaveStamp 的 key 强制重挂载
  const stampSeqRef = useRef(0) // 印记序号：每次盖印自增，key 变化强制重挂载（重置 1.2s 计时，且不因旧印记未卸载而失效）

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  // 保存管线（M5a 拆分）：串行保存链/自动保存/布局落盘；脏标记 ref 归本视图持有（守卫「放弃」路径也读写）
  const pipeline = useSavePipeline({
    adapter,
    mdPath,
    mmRef,
    layoutRef,
    dirtyRef,
    onDirtyChange: (isDirty) => (isDirty ? markDirty() : clearDirty()),
    onError: setError,
    // 落盘成功后按最新树重建双链（M5b Task 3）：[[..]] 是文本派生标记，保存链（含 5s 自动保存）是统一重建时机
    onSaved: () => {
      const mm = mmRef.current
      mm?.rebuildLinks?.(resolveAllLinks(engineTreeToZen(mm.getData()).tree))
    },
  })

  // 忽略块流（M5a 拆分）：未映射块状态与显式保存确认门（确认挂起前暂停自动保存）
  const flow = useIgnoredFlow({ clearPendingAutosave: pipeline.clearPendingAutosave })

  // 选中跟踪（M5a 拆分）：激活节点 uid 的 ref/state 双轨与复制前的陈旧清理兜底
  const selection = useActiveSelection()

  // 节点备注编辑（M5b 拆出）：对话框状态与 SET_NODE_DATA 保存链（行数护栏）
  const noteEdit = useNoteEdit(mmRef, selection.activeUidRef)

  /** 盖印记（Task 7 修复）：seq 自增 → key 变化强制重挂载——到期前重复触发重置 1.2s 计时，
   *  到期后（onDone 已置 null）再次触发也全新挂载，同会话可反复盖印 */
  const flashStamp = (kind: 'saved' | 'copied'): void => {
    stampSeqRef.current += 1
    setStamp({ kind, seq: stampSeqRef.current })
  }

  /** 复制范围解析：有选中节点→该 uid 子树（序列化从 H1 重计层级，spec §3.1）；否则整图。
   *  陈旧 uid 兜底（M4 缓期项清偿）：uid 未命中渲染树（如撤销删除）时清选中回退整图，不留幽灵选中 */
  const doCopy = async (): Promise<void> => {
    try {
      const mm = mmRef.current
      if (!mm) return
      const full = mm.getData()
      selection.clearStaleIfMissing(full)
      const uid = selection.activeUidRef.current
      const active = uid ? findSubtreeByUid(full, uid) : null
      await writeClipboard(serialize(engineTreeToZen(active ?? full).tree))
      flashStamp('copied')
    } catch (e) {
      setError('复制失败：' + String(e))
    }
  }

  /** 多行粘贴执行（spec §3.6）：首行替换被编辑节点文本，其余行逐个插入其子节点。
   *  顺序上必须先关引擎编辑框再 SET_NODE_TEXT：INSERT_CHILD_NODE 内部会调 hideEditTextBox，
   *  以编辑框内粘贴前的旧文本提交覆盖首行（TextEdit.js:492，引擎核验笔记）。
   *  无引擎实例/无激活 uid/uid 未命中渲染树均静默放弃（无目标语义） */
  const applyMultilinePaste = (raw: string): void => {
    const lines = splitMultilineText(raw)
    if (lines.length === 0) return
    const mm = mmRef.current
    const uid = selection.activeUidRef.current
    if (!mm || !uid) return
    const node = mm.renderer?.findNodeByUid(uid)
    if (!node) return
    mm.renderer?.textEdit.hideEditTextBox()
    mm.execCommand('SET_NODE_TEXT', node, lines[0])
    for (const line of lines.slice(1)) {
      mm.execCommand('INSERT_CHILD_NODE', false, [node], { text: line })
    }
  }

  /** 落盘 + 成功印记（Task 7）：此前有脏内容且落盘成功才盖「已存」——
   *  干净状态下保存是 no-op（无用户可感知的写盘），不印记 */
  const saveAndStamp = async (): Promise<boolean> => {
    const wasDirty = dirtyRef.current
    const ok = await pipeline.saveNow()
    if (ok && wasDirty) flashStamp('saved')
    return ok
  }

  /** 显式保存统一入口（spec §3.5 实施细化）：有未映射块且本会话未确认过 → 经 flow 门弹确认挂起本次保存，
   *  返回 false 与「保存失败」同义（调用方留在原界面）；确认后由对话框回调直接落盘。
   *  自动保存（5s 防抖）不经此入口：每 5 秒弹窗极扰人，裁定静默丢弃（内容打开时横幅已知情）；印记只属显式保存 */
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
        // sidecar.layout 三处同步：挂载初值 + 激活态 + 保存引用（spec §3.7 打开恢复）；
        // 无 sidecar（如外部放入的 .md）回退用户偏好布局（验收轮三：记住默认视图）
        const initial = sc?.layout ?? useAppStore.getState().preferredLayout
        setInitialLayout(initial)
        setLayout(initial)
        layoutRef.current = initial
        setEngineTree(zenToEngineTree(r.tree, new Set(sc?.collapsed ?? [])))
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

  // 快捷键（Ctrl+S / Ctrl+Shift+C）留本视图的 window effect（M5a 收敛裁定，不随砚栏迁移）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void doCopy()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void explicitSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 监听只绑一次（闭包取首渲染值），explicitSave/doCopy 走 refs 无需重绑
  }, [])

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
    <div className="editor">
      <div className="canvas-host">
        {engineTree && (
          <MindMapCanvas
            key={mdPath}
            tree={engineTree}
            layout={layoutToEngine(initialLayout)}
            theme={engineThemeName(resolvedTheme)}
            onReady={(mm) => {
              mmRef.current = mm
              // 初始双链：此时引擎首帧尚未渲染且 getData() 未初始化，用打开时解析的 engineTree 作源；
              // rebuildLinks 内部等待首帧渲染完成后落线
              mm.rebuildLinks?.(resolveAllLinks(engineTreeToZen(engineTree).tree))
            }}
            onDataChange={pipeline.onTreeDataChange}
            onActiveChange={selection.handleActiveChange}
            onEditorPaste={applyMultilinePaste}
          />
        )}
      </div>
      {/* 浮动砚栏（M5a 拆分至 ZenBar）：静置淡化，悬停/聚焦浮现（spec §4.4 UI 隐身） */}
      <ZenBar
        onBack={async () => {
          pipeline.clearPendingAutosave()
          if (await explicitSave()) await backToLibrary() // 失败/确认挂起：留在编辑器（确认后仅落盘，不自动导航）
        }}
        onCopyClick={() => void doCopy()}
        copied={false}
        scope={selection.activeUid ? 'branch' : 'full'}
        onSaveClick={() => void explicitSave()}
        onNoteClick={noteEdit.openNoteDialog}
        noteEnabled={selection.activeUid !== null}
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
      {/* 对话框互斥约定（ZenDialog）：本视图至多同时一个 ZenDialog——guarding 优先于 flow.confirming
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
      />
    </div>
  )
}
