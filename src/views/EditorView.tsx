import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import {
  engineTreeToZen,
  findSubtreeByUid,
  parse,
  serialize,
  zenToEngineTree,
} from '../services/mdTree'
import { readSidecar, writeSidecar } from '../services/sidecar'
import { splitMultilineText } from '../services/multiline'
import type { WriteClipboard } from '../services/clipboard'
import MindMapCanvas from '../editor/MindMapCanvas'
import { layoutToEngine, type LayoutKind } from '../editor/layoutMap'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { Sidecar } from '../types/files'
import type { RegisterCloseGuard } from '../types/ports'
import type { IgnoredBlock } from '../types/tree'
import CloseGuardDialog from '../components/CloseGuardDialog'
import IgnoredBlocksBanner from '../components/IgnoredBlocksBanner'

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

const AUTOSAVE_MS = 5000

export default function EditorView({
  mdPath,
  openInEditor,
  writeClipboard,
  registerCloseGuard,
  exitApp,
}: Readonly<Props>) {
  const { adapter, markDirty, clearDirty, backToLibrary, setError } = useAppStore()
  const dirty = useAppStore((s) => s.dirty)
  const mmRef = useRef<MindMapHandle | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true)) // 当前串行保存轮（在途合并调用方等待它的最终结局）
  const dataRevRef = useRef(0) // 数据修订号：写盘窗口内落新编辑时递增，writeOnce 据此拒绝盲目清脏
  const layoutRef = useRef<LayoutKind>('mindmap') // 保存时写入 sidecar.layout 的真实值
  const activeUidRef = useRef<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guardSavingRef = useRef(false) // 守卫保存在途：三态选择一律挡下（见 onGuardChoice）
  // 布局双状态（spec §3.7）：initialLayout 是画布挂载期布局（引擎构造参数，只在打开时来自 sidecar）；
  // layout 是当前激活布局（按钮点亮）。运行中切换走 mm.setLayout 即时重排、不重挂载画布，
  // 故二者分开：switchLayout 只更新 layout/layoutRef，不动 initialLayout
  const [layout, setLayout] = useState<LayoutKind>('mindmap')
  const [initialLayout, setInitialLayout] = useState<LayoutKind>('mindmap')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<{ error: string; raw: string } | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)
  const [activeUid, setActiveUid] = useState<string | null>(null) // 仅供按钮文案/样式
  const [copied, setCopied] = useState(false)
  const [guarding, setGuarding] = useState(false) // 关闭守卫对话框（spec §4 关闭拦截）
  const [ignored, setIgnored] = useState<IgnoredBlock[]>([]) // 未映射块（渲染横幅/确认文案）
  const [confirmingIgnored, setConfirmingIgnored] = useState(false) // 忽略块保存确认对话框
  // Ctrl+S 监听只绑定一次（下方 effect 闭包取首渲染值），逻辑判断必须走 refs（同 dirtyRef 模式）
  const ignoredRef = useRef<IgnoredBlock[]>([])
  const ignoredConfirmedRef = useRef(false) // 本会话确认过一次即不再弹（spec §3.5）

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  /** 复制范围解析：有选中节点→该 uid 子树（序列化从 H1 重计层级，spec §3.1）；否则整图 */
  const buildCopyText = (): string | null => {
    const mm = mmRef.current
    if (!mm) return null
    const full = mm.getData()
    const active = activeUidRef.current ? findSubtreeByUid(full, activeUidRef.current) : null
    return serialize(engineTreeToZen(active ?? full).tree)
  }

  const doCopy = async (): Promise<void> => {
    try {
      const text = buildCopyText()
      if (text === null) return
      await writeClipboard(text)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      setError('复制失败：' + String(e))
    }
  }

  /** 多行粘贴执行（spec §3.6）：首行替换被编辑节点文本，其余行逐个插入其子节点。
   *  被编辑节点即激活节点（编辑框打开前提）；无引擎实例/无激活 uid/uid 未命中渲染树均静默放弃（无目标语义）。
   *  顺序上必须先关引擎编辑框再 SET_NODE_TEXT：INSERT_CHILD_NODE 内部会调 hideEditTextBox，
   *  其会用编辑框内粘贴前的旧文本提交 SET_NODE_TEXT，覆盖掉首行（TextEdit.js:492，引擎核验笔记）。 */
  const applyMultilinePaste = (raw: string): void => {
    const lines = splitMultilineText(raw)
    if (lines.length === 0) return
    const mm = mmRef.current
    const uid = activeUidRef.current
    if (!mm || !uid) return
    const node = mm.renderer?.findNodeByUid(uid)
    if (!node) return
    mm.renderer?.textEdit.hideEditTextBox()
    mm.execCommand('SET_NODE_TEXT', node, lines[0])
    for (const line of lines.slice(1)) {
      mm.execCommand('INSERT_CHILD_NODE', false, [node], { text: line })
    }
  }

  /** 完整 Sidecar 构造（writeOnce 与布局切换即时落盘共用同一形状；layout 取当前切换值） */
  const buildSidecar = (collapsed: string[]): Sidecar => ({
    version: 1,
    theme: 'default',
    layout: layoutRef.current,
    collapsed,
    offsets: {},
    canvas: { x: 0, y: 0, zoom: 1 },
  })

  /** 单轮保存：md + sidecar 原子落盘，返回成功与否（无实例/不脏视为成功）。
   *  清脏以修订号为门闩：快照前记 dataRevRef，写盘窗口内若落新编辑（修订号变）则本轮快照
   *  不含该编辑——此时不能清脏（否则该编辑不在任何快照里且无人再补存，静默丢失），保脏并置补存。 */
  const writeOnce = async (): Promise<boolean> => {
    const mm = mmRef.current
    if (!mm || !dirtyRef.current) return true
    try {
      const rev = dataRevRef.current
      const { tree, collapsed } = engineTreeToZen(mm.getData())
      await adapter.writeTextFileAtomic(mdPath, serialize(tree))
      await writeSidecar(adapter, mdPath, buildSidecar(collapsed))
      if (dataRevRef.current !== rev) {
        // 写盘窗口内有新编辑：保脏，置补存让串行循环用新快照再来一轮
        pendingRef.current = true
        return true
      }
      dirtyRef.current = false
      clearDirty()
      return true
    } catch (e) {
      // 保存失败：保留脏标记（数据未落盘不能丢），提示后等待重试
      dirtyRef.current = true
      markDirty()
      setError('保存失败：' + String(e))
      return false
    }
  }

  /** 串行化保存：在途时新请求只标记补存，并等待当前轮的最终结局（其循环会消化补存标记）。
   *  合并分支必须返回当前轮 promise 而非立即 true——否则守卫保存/返回文件库会在补存轮
   *  真正落盘前退出（窗口销毁/引擎销毁，补存轮可能永不执行）。 */
  const saveNow = async (): Promise<boolean> => {
    if (savingRef.current) {
      pendingRef.current = true
      return saveChainRef.current
    }
    const run = (async () => {
      savingRef.current = true
      try {
        while (true) {
          pendingRef.current = false
          if (!(await writeOnce())) return false
          if (!pendingRef.current) return true
        }
      } finally {
        savingRef.current = false
      }
    })()
    saveChainRef.current = run
    return run
  }

  /** 显式保存统一入口（spec §3.5 实施细化）：有未映射块且本会话未确认过 → 弹确认挂起本次保存，
   *  返回 false 与「保存失败」同义（调用方留在原界面）；确认后由对话框回调直接调 saveNow。
   *  自动保存（5s 防抖定时器）不经此入口：每 5 秒弹窗极扰人，裁定静默丢弃——
   *  丢弃内容在打开时的横幅已知情（裁定细节见任务报告）。 */
  const explicitSave = async (): Promise<boolean> => {
    if (ignoredRef.current.length > 0 && !ignoredConfirmedRef.current) {
      // 等待用户裁决期间暂停自动保存，防止确认悬而未决时被定时器静默落盘丢弃
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmingIgnored(true)
      return false
    }
    return saveNow()
  }

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
        ignoredRef.current = r.ignoredBlocks
        setIgnored(r.ignoredBlocks)
        // sidecar.layout 三处同步：挂载初值 + 激活态 + 保存引用（spec §3.7 打开恢复）
        const initial = sc?.layout ?? 'mindmap'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicitSave/saveNow/doCopy 闭包依赖 refs，无需重绑
  }, [])

  // 关闭守卫（spec §4）：dirty 时拦截窗口关闭弹三态对话框；干净则放行自然关闭
  useEffect(() => {
    const unregister = registerCloseGuard((e) => {
      if (!dirtyRef.current) return
      e.preventClose()
      setGuarding(true)
    })
    return unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载期注册一次，端口经 props 注入且稳定
  }, [])

  /** 三态选择：取消→收起；放弃→清脏直退；保存→走 explicitSave 落盘成功才退。
   *  guardSavingRef 防误触：保存一旦在途，三态（含取消/放弃）一律挡下——收框会与在途落盘竞态，
   *  放弃清脏直退更会在写盘未完成时销毁窗口（数据丢失）；连点保存同理绕过等待提前 exitApp。
   *  explicitSave 返回 false 的两种情形同路处理（收起守卫对话框留在应用）：保存失败（横幅已提示）；
   *  忽略块确认挂起——由确认对话框接管，确认后仅落盘不退出，用户需再次关闭窗口（不静默退出/丢弃，spec §3.5 细化）。 */
  const onGuardChoice = async (c: 'save' | 'discard' | 'cancel'): Promise<void> => {
    if (guardSavingRef.current) return // 保存动作在途：本轮对话框冻结，任何选择都不生效
    if (c === 'cancel') {
      setGuarding(false)
      return
    }
    if (c === 'discard') {
      dirtyRef.current = false
      setGuarding(false)
      exitApp()
      return
    }
    guardSavingRef.current = true
    const ok = await explicitSave()
    guardSavingRef.current = false
    if (!ok) {
      setGuarding(false)
      return
    }
    setGuarding(false)
    exitApp()
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      if (dirtyRef.current) void saveNow() // unmount 冲刷（含返回文件库）
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount 冲刷，saveNow 依赖 refs
  }, [])

  const onDataChange = () => {
    dirtyRef.current = true
    dataRevRef.current++
    // 写盘在途时的新编辑不在在途快照内：标记补存，让当前轮写完再补一轮（否则无人再触发落盘）
    if (savingRef.current) pendingRef.current = true
    markDirty()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveNow(), AUTOSAVE_MS)
  }

  /** sidecar-only 即时落盘（审查裁定）：collapsed 取引擎当前树，构造与 writeOnce 相同；
   *  仅写 sidecar，不写 .md、不动脏标记；失败提示横幅（fire-and-forget，不重试不阻塞） */
  const persistLayoutSidecar = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    try {
      const { collapsed } = engineTreeToZen(mm.getData())
      await writeSidecar(adapter, mdPath, buildSidecar(collapsed))
    } catch (e) {
      setError('保存布局失败：' + String(e))
    }
  }

  /** 布局切换（spec §3.7 + 审查裁定）：引擎 setLayout 即时重排，不置脏、不触发内容保存。
   *  但布局偏好本身须即时落 sidecar：否则用户切换后不再编辑，writeOnce 的 !dirty 早退
   *  使偏好永不落盘，"重开恢复"变成有条件的（元数据即时落盘不违背"不置脏不自动保存"） */
  const switchLayout = (kind: LayoutKind) => {
    mmRef.current?.setLayout(layoutToEngine(kind))
    layoutRef.current = kind
    setLayout(kind)
    void persistLayoutSidecar()
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
      <header className="editor-toolbar">
        <button
          type="button"
          data-testid="btn-back"
          onClick={async () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            const ok = await explicitSave()
            if (!ok) return // 保存失败或忽略块确认挂起：留在编辑器（确认后仅落盘，不自动导航）
            await backToLibrary()
          }}
        >
          ← 返回
        </button>
        <span className="editor-title">
          {name}
          {dirty && (
            <span data-testid="dirty-badge" title="有未保存修改">
              ●
            </span>
          )}
        </span>
        <button
          type="button"
          data-testid="btn-copy"
          className={copied ? 'copied' : undefined}
          title={
            activeUid
              ? '复制选中分支为 Markdown（Ctrl+Shift+C）'
              : '复制整图为 Markdown（Ctrl+Shift+C）'
          }
          onClick={() => void doCopy()}
          disabled={state !== 'ready'}
        >
          {copied ? '✓ 已复制' : '复制 MD'}
        </button>
        <button type="button" data-testid="btn-save" onClick={() => void explicitSave()}>
          保存
        </button>
        <fieldset className="layout-switch" aria-label="布局切换">
          {(
            [
              ['mindmap', '思维导图'],
              ['logic', '逻辑图'],
              ['org', '组织结构图'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              data-testid={`layout-${kind}`}
              className={layout === kind ? 'active' : ''}
              aria-pressed={layout === kind}
              onClick={() => switchLayout(kind)}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </header>
      {ignored.length > 0 && <IgnoredBlocksBanner blocks={ignored} />}
      <div className="canvas-host">
        {engineTree && (
          <MindMapCanvas
            key={mdPath}
            tree={engineTree}
            layout={layoutToEngine(initialLayout)}
            onReady={(mm) => (mmRef.current = mm)}
            onDataChange={onDataChange}
            onActiveChange={(uid) => {
              activeUidRef.current = uid
              setActiveUid(uid)
            }}
            onEditorPaste={applyMultilinePaste}
          />
        )}
      </div>
      {guarding && <CloseGuardDialog mapName={name} onChoice={(c) => void onGuardChoice(c)} />}
      {confirmingIgnored && (
        <div className="dialog-mask" role="dialog" aria-label="保存确认">
          <div className="dialog">
            <h3>保存将丢弃 {ignored.length} 个未映射的内容块</h3>
            <div className="dialog-actions">
              <button
                type="button"
                data-testid="ignored-confirm-cancel"
                onClick={() => setConfirmingIgnored(false)}
              >
                取消
              </button>
              <button
                type="button"
                data-testid="ignored-confirm-save"
                onClick={() => {
                  setConfirmingIgnored(false)
                  ignoredConfirmedRef.current = true // 本会话确认过即不再弹（spec §3.5）
                  void saveNow() // 仅落盘：确认前挂起的返回/关闭动作不自动续行（用户再点一次）
                }}
              >
                继续保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
