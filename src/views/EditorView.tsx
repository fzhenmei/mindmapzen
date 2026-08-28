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
import { engineThemeName } from '../editor/engineThemes'
import { layoutToEngine, type LayoutKind } from '../editor/layoutMap'
import { centerRoot, fitView } from '../editor/viewOps'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { Sidecar } from '../types/files'
import type { RegisterCloseGuard } from '../types/ports'
import type { IgnoredBlock } from '../types/tree'
import CloseGuardDialog from '../components/CloseGuardDialog'
import IgnoredBlocksBanner from '../components/IgnoredBlocksBanner'
import SaveStamp from '../components/SaveStamp'
import ZenDialog from '../components/ZenDialog'
import ThemeToggle from '../components/ThemeToggle'
import {
  IconArrowLeft,
  IconCopy,
  IconCrosshair,
  IconFrame,
  IconLayoutBoth,
  IconLayoutDown,
  IconLayoutRight,
  IconMinus,
  IconPlus,
  IconSave,
} from '../components/icons'

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
  const resolvedTheme = useAppStore((s) => s.resolvedTheme)
  const mmRef = useRef<MindMapHandle | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true)) // 当前串行保存轮（在途合并调用方等待它的最终结局）
  const dataRevRef = useRef(0) // 数据修订号：写盘窗口内落新编辑时递增，writeOnce 据此拒绝盲目清脏
  const layoutRef = useRef<LayoutKind>('mindmap') // 保存时写入 sidecar.layout 的真实值
  const activeUidRef = useRef<string | null>(null)
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
  const [stamp, setStamp] = useState<'saved' | 'copied' | null>(null) // 印记：显式保存/复制成功后闪现 1.2s
  const [guarding, setGuarding] = useState(false) // 关闭守卫对话框（spec §4 关闭拦截）
  const [ignored, setIgnored] = useState<IgnoredBlock[]>([]) // 未映射块（渲染横幅/确认文案）
  const [confirmingIgnored, setConfirmingIgnored] = useState(false) // 忽略块保存确认对话框
  // Ctrl+S 监听只绑定一次（下方 effect 闭包取首渲染值），逻辑判断必须走 refs（同 dirtyRef 模式）
  const ignoredRef = useRef<IgnoredBlock[]>([])
  const ignoredConfirmedRef = useRef(false) // 本会话确认过一次即不再弹（spec §3.5）

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  /** 复制范围解析：有选中节点→该 uid 子树（序列化从 H1 重计层级，spec §3.1）；否则整图。
   *  陈旧 uid 兜底（M4 缓期项清偿）：选中 uid 未命中渲染树（如撤销删除了该节点）时，
   *  清除选中态回退整图复制——按钮 data-scope/title 随之回整图，不留幽灵选中 */
  const doCopy = async (): Promise<void> => {
    try {
      const mm = mmRef.current
      if (!mm) return
      const full = mm.getData()
      const active = activeUidRef.current ? findSubtreeByUid(full, activeUidRef.current) : null
      if (activeUidRef.current && !active) {
        activeUidRef.current = null
        setActiveUid(null)
      }
      await writeClipboard(serialize(engineTreeToZen(active ?? full).tree))
      setStamp('copied')
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

  /** 落盘 + 成功印记（Task 7）：此前有脏内容且落盘成功才盖「已存」——
   *  干净状态下保存是 no-op（无用户可感知的写盘），不印记 */
  const saveAndStamp = async (): Promise<boolean> => {
    const wasDirty = dirtyRef.current
    const ok = await saveNow()
    if (ok && wasDirty) setStamp('saved')
    return ok
  }

  /** 显式保存统一入口（spec §3.5 实施细化）：有未映射块且本会话未确认过 → 弹确认挂起本次保存，
   *  返回 false 与「保存失败」同义（调用方留在原界面）；确认后由对话框回调直接落盘。
   *  自动保存（5s 防抖定时器）不经此入口：每 5 秒弹窗极扰人，裁定静默丢弃——
   *  丢弃内容在打开时的横幅已知情（裁定细节见任务报告）；印记亦只属于显式保存。 */
  const explicitSave = async (): Promise<boolean> => {
    if (ignoredRef.current.length > 0 && !ignoredConfirmedRef.current) {
      // 等待用户裁决期间暂停自动保存，防止确认悬而未决时被定时器静默落盘丢弃
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirmingIgnored(true)
      return false
    }
    return saveAndStamp()
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
      clearDirty() // store 脏标记同步清除：exitApp 失败窗口留下时，避免"● 显示未保存但保存 no-op"的僵尸态
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
      {/* 浮动砚栏：静置淡化，悬停/聚焦浮现（spec §4.4 UI 隐身） */}
      <header className="zen-bar" data-testid="zen-bar">
        <button
          type="button"
          data-testid="btn-back"
          title="返回文件库"
          onClick={async () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            const ok = await explicitSave()
            if (!ok) return // 保存失败或忽略块确认挂起：留在编辑器（确认后仅落盘，不自动导航）
            await backToLibrary()
          }}
        >
          <IconArrowLeft />
        </button>
        <span className="zen-bar-sep" />
        <button
          type="button"
          data-testid="btn-copy"
          data-scope={activeUid ? 'branch' : 'full'}
          title={
            activeUid
              ? '复制选中分支为 Markdown（Ctrl+Shift+C）'
              : '复制整图为 Markdown（Ctrl+Shift+C）'
          }
          onClick={() => void doCopy()}
        >
          <IconCopy />
        </button>
        <button
          type="button"
          data-testid="btn-save"
          title="保存（Ctrl+S）"
          onClick={() => void explicitSave()}
        >
          <IconSave />
        </button>
        <span className="zen-bar-sep" />
        <button
          type="button"
          data-testid="btn-zoom-out"
          title="缩小（Ctrl+滚轮）"
          onClick={() => mmRef.current?.view.narrow()}
        >
          <IconMinus />
        </button>
        <button
          type="button"
          data-testid="btn-zoom-in"
          title="放大（Ctrl+滚轮）"
          onClick={() => mmRef.current?.view.enlarge()}
        >
          <IconPlus />
        </button>
        <button
          type="button"
          data-testid="btn-center-root"
          title="根居中：保持缩放回根"
          onClick={() => mmRef.current && centerRoot(mmRef.current)}
        >
          <IconCrosshair />
        </button>
        <button
          type="button"
          data-testid="btn-fit"
          title="适配整图"
          onClick={() => mmRef.current && fitView(mmRef.current)}
        >
          <IconFrame />
        </button>
        <span className="zen-bar-sep" />
        <fieldset className="layout-switch" aria-label="布局切换">
          {(
            [
              ['mindmap', '思维导图（右向）', <IconLayoutRight key="r" />],
              ['logic', '逻辑图（左右）', <IconLayoutBoth key="b" />],
              ['org', '组织结构图（向下）', <IconLayoutDown key="d" />],
            ] as const
          ).map(([kind, label, icon]) => (
            <button
              key={kind}
              type="button"
              data-testid={`layout-${kind}`}
              className={layout === kind ? 'active' : ''}
              aria-pressed={layout === kind}
              title={label}
              onClick={() => switchLayout(kind)}
            >
              {icon}
            </button>
          ))}
        </fieldset>
      </header>
      {/* 印记（Task 7）：显式保存成功朱砂印 / 复制成功墨青印，右上角闪现 1.2s（自动保存静默不印记） */}
      {stamp && <SaveStamp kind={stamp} />}
      {/* 左下题签 + 朱砂脏印；右下主题钮 */}
      <div className="editor-caption">
        <span className="caption-name">{name}</span>
        {dirty && <span data-testid="dirty-badge" className="seal-dot" title="有未保存修改" />}
      </div>
      <div className="theme-fab">
        <ThemeToggle />
      </div>
      {/* 忽略块横幅改挂砚栏下方（.zen-banner 浮于画布）——既有结构照搬，仅换容器类（Task 6 迁移） */}
      {ignored.length > 0 && <IgnoredBlocksBanner blocks={ignored} />}
      {/* 对话框互斥约定（ZenDialog）：本视图至多同时一个 ZenDialog——guarding 优先于
          confirmingIgnored（守卫保存触发确认时，守卫先收起、确认框随即接管，故 !guarding 门闩） */}
      {guarding && <CloseGuardDialog mapName={name} onChoice={(c) => void onGuardChoice(c)} />}
      {confirmingIgnored && !guarding && (
        <ZenDialog
          title={`保存将丢弃 ${ignored.length} 个未映射的内容块`}
          onClose={() => setConfirmingIgnored(false)}
          actions={
            <>
              <button type="button" data-testid="ignored-confirm-cancel" onClick={() => setConfirmingIgnored(false)}>
                取消
              </button>
              <button
                type="button"
                data-testid="ignored-confirm-save"
                onClick={() => {
                  setConfirmingIgnored(false)
                  ignoredConfirmedRef.current = true // 本会话确认过即不再弹（spec §3.5）
                  void saveAndStamp() // 仅落盘（含印记）：确认前挂起的返回/关闭动作不自动续行（用户再点一次）
                }}
              >
                继续保存
              </button>
            </>
          }
        />
      )}
    </div>
  )
}
