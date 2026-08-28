import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, parse, serialize, zenToEngineTree } from '../services/mdTree'
import { readSidecar, writeSidecar } from '../services/sidecar'
import MindMapCanvas from '../editor/MindMapCanvas'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { Sidecar } from '../types/files'

interface Props {
  mdPath: string
  openInEditor: (path: string) => void
}

const AUTOSAVE_MS = 5000

export default function EditorView({ mdPath, openInEditor }: Readonly<Props>) {
  const { adapter, markDirty, clearDirty, backToLibrary } = useAppStore()
  const dirty = useAppStore((s) => s.dirty)
  const mmRef = useRef<MindMapHandle | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorInfo, setErrorInfo] = useState<{ error: string; raw: string } | null>(null)
  const [engineTree, setEngineTree] = useState<EngineNode | null>(null)

  const name = mdPath.split('/').pop()!.replace(/\.md$/, '')

  const saveNow = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm || !dirtyRef.current) return
    const { tree, collapsed } = engineTreeToZen(mm.getData())
    const sidecar: Sidecar = {
      version: 1, theme: 'default', layout: 'mindmap',
      collapsed, offsets: {}, canvas: { x: 0, y: 0, zoom: 1 },
    }
    await adapter.writeTextFileAtomic(mdPath, serialize(tree))
    await writeSidecar(adapter, mdPath, sidecar)
    dirtyRef.current = false
    clearDirty()
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
        setErrorInfo({ error: `无法读取文件（可能已被移动或删除）：${e instanceof Error ? e.message : String(e)}`, raw: '' })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 文档内容由父组件 key 重挂载切换
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveNow 闭包依赖 refs，无需重绑
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
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
          />
        )}
      </div>
    </div>
  )
}
