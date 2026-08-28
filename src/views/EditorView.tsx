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
import type { LayoutKind } from '../editor/layoutMap'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { Sidecar } from '../types/files'
import type { RegisterCloseGuard } from '../types/ports'
import CloseGuardDialog from '../components/CloseGuardDialog'

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
  const layoutRef = useRef<LayoutKind>('mindmap') // 本阶段先默认，后续接 sidecar/切换的真实值
  const activeUidRef = useRef<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guardSavingRef = useRef(false) // 守卫保存防重入（见 onGuardChoice）
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<{ error: string; raw: string } | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)
  const [activeUid, setActiveUid] = useState<string | null>(null) // 仅供按钮文案/样式
  const [copied, setCopied] = useState(false)
  const [guarding, setGuarding] = useState(false) // 关闭守卫对话框（spec §4 关闭拦截）

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

  /** 单轮保存：md + sidecar 原子落盘，返回成功与否（无实例/不脏视为成功） */
  const writeOnce = async (): Promise<boolean> => {
    const mm = mmRef.current
    if (!mm || !dirtyRef.current) return true
    try {
      const { tree, collapsed } = engineTreeToZen(mm.getData())
      const sidecar: Sidecar = {
        version: 1,
        theme: 'default',
        layout: layoutRef.current,
        collapsed,
        offsets: {},
        canvas: { x: 0, y: 0, zoom: 1 },
      }
      await adapter.writeTextFileAtomic(mdPath, serialize(tree))
      await writeSidecar(adapter, mdPath, sidecar)
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

  /** 串行化保存：在途时新请求只标记补存；循环直到一轮内无新变更（spec §3.4） */
  const saveNow = async (): Promise<boolean> => {
    if (savingRef.current) {
      pendingRef.current = true
      return true
    }
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
        void saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveNow/doCopy 闭包依赖 refs，无需重绑
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

  /** 三态选择：取消→收起；放弃→清脏直退；保存→落盘成功才退（失败留在应用，横幅已提示）。
   *  guardSavingRef 防重入：saveNow 在途合并会立即返回 true，连点保存若不加防将绕过等待提前 exitApp（落盘未完成即销毁窗口）。 */
  const onGuardChoice = async (c: 'save' | 'discard' | 'cancel'): Promise<void> => {
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
    if (guardSavingRef.current) return
    guardSavingRef.current = true
    const ok = await saveNow()
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
    markDirty()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveNow(), AUTOSAVE_MS)
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
            const ok = await saveNow()
            if (!ok) return // 保存失败留在编辑器（spec §3.4）
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
        <button type="button" data-testid="btn-save" onClick={() => void saveNow()}>
          保存
        </button>
      </header>
      <div className="canvas-host">
        {engineTree && (
          <MindMapCanvas
            key={mdPath}
            tree={engineTree}
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
    </div>
  )
}
