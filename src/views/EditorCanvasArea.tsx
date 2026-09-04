// src/views/EditorCanvasArea.tsx —— 画布内容区三态（2026-09 自 EditorView 拆出，行数护栏）：
// error=打开失败错误面板（只占画布内容区，壳层其余照常挂载——Ctrl+P / Ctrl+Tab /
// 返回案头可达）；loading=加载指示；ready=引擎画布。纯装配：状态与回调全经 props。
import type { RefObject } from 'react'
import MindMapCanvas from '../editor/MindMapCanvas'
import EditorErrorPanel from '../components/EditorErrorPanel'
import { layoutToEngine } from '../editor/layoutMap'
import { engineThemeName } from '../editor/engineThemes'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { LayoutKind } from '../types/files'
import type { ResolvedTheme } from '../services/theme'

/** 打开失败信息（2026-09 分型）：kind=read 文件读不到（无修复按钮）；parse 内容坏（可纯文本修复） */
export interface OpenFailInfo {
  kind: 'read' | 'parse'
  error: string
  raw: string
}

interface Props {
  state: 'loading' | 'ready' | 'error'
  errorInfo: OpenFailInfo | null
  mdPath: string
  openInEditor(path: string): void
  /** 返回案头（错误面板主出路，安全链由 EditorView 组合） */
  onBack(): void
  /** 打开其他导图（呼快速切换浮层） */
  onSwitch(): void
  engineTree: EngineNode | null
  registry: LinkRegistry
  initialLayout: LayoutKind
  resolvedTheme: ResolvedTheme
  mmRef: RefObject<MindMapHandle | null>
  /** 引擎就绪（EditorView 组合：mmRef 赋值 + 连线净化 + 撤销订阅） */
  onCanvasReady(mm: MindMapHandle): void
  /** 引擎数据变更（统计行 + 保存管线） */
  onDataChange(data?: EngineNode): void
  /** 引擎激活列表变化（圈选多选镜像：uid 数组，空数组 = 无选中） */
  onActiveChange(uids: string[]): void
  onPaste(rawText: string): void
  onNodeCopy(): void
}

export default function EditorCanvasArea({
  state,
  errorInfo,
  mdPath,
  openInEditor,
  onBack,
  onSwitch,
  engineTree,
  registry,
  initialLayout,
  resolvedTheme,
  mmRef,
  onCanvasReady,
  onDataChange,
  onActiveChange,
  onPaste,
  onNodeCopy,
}: Readonly<Props>) {
  if (state === 'error' && errorInfo)
    return (
      <EditorErrorPanel
        kind={errorInfo.kind}
        error={errorInfo.error}
        raw={errorInfo.raw}
        mdPath={mdPath}
        onRawEdit={openInEditor}
        onBack={onBack}
        onSwitch={onSwitch}
      />
    )
  if (state === 'loading') return <div className="editor-loading">正在打开…</div>
  return engineTree ? (
    <MindMapCanvas
      key={mdPath}
      tree={engineTree}
      registry={registry}
      layout={layoutToEngine(initialLayout)}
      theme={engineThemeName(resolvedTheme)}
      onReady={(mm) => {
        mmRef.current = mm
        onCanvasReady(mm)
      }}
      onDataChange={onDataChange}
      onActiveChange={onActiveChange}
      onEditorPaste={onPaste}
      onNodeCopy={onNodeCopy}
    />
  ) : null
}
