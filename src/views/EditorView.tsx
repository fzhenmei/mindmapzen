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
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { Sidecar } from '../types/files'

interface Props {
  mdPath: string
  openInEditor: (path: string) => void
  /** 剪贴板写入端口：生产为 Tauri 插件实现，测试注入内存实现 */
  writeClipboard: WriteClipboard
}

const AUTOSAVE_MS = 5000

export default function EditorView({ mdPath, openInEditor, writeClipboard }: Readonly<Props>) {
  const { adapter, markDirty, clearDirty, backToLibrary, setError } = useAppStore()
  const dirty = useAppStore((s) => s.dirty)
  const mmRef = useRef<MindMapHandle | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const activeUidRef = useRef<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<{ error: string; raw: string } | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)
  const [activeUid, setActiveUid] = useState<string | null>(null) // 仅供按钮文案/样式
  const [copied, setCopied] = useState(false)

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

  const saveNow = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm || !dirtyRef.current) return
    try {
      const { tree, collapsed } = engineTreeToZen(mm.getData())
      const sidecar: Sidecar = {
        version: 1,
        theme: 'default',
        layout: 'mindmap',
        collapsed,
        offsets: {},
        canvas: { x: 0, y: 0, zoom: 1 },
      }
      await adapter.writeTextFileAtomic(mdPath, serialize(tree))
      await writeSidecar(adapter, mdPath, sidecar)
      dirtyRef.current = false
      clearDirty()
    } catch (e) {
      // 保存失败：保留脏标记（数据未落盘不能丢），提示后等待重试
      dirtyRef.current = true
      markDirty()
      setError('保存失败：' + String(e))
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
            await saveNow()
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
    </div>
  )
}
