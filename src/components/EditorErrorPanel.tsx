// src/components/EditorErrorPanel.tsx —— 打开失败错误面板（2026-09 自 EditorView 拆出，
// 行数护栏）：parse 错误（显示原文可修复）与读文件失败（可能已被移动/删除）共用，
// 「以纯文本打开修复」走外部编辑器（openInEditor 端口由 EditorView 注入）
interface Props {
  /** 失败原因（中文，含原文细节） */
  error: string
  /** parse 失败时的原文（读文件失败为空串） */
  raw: string
  /** 以纯文本打开修复（Tauri opener，路径由 EditorView 传） */
  onRawEdit(path: string): void
  /** 导图文件路径 */
  mdPath: string
}

export default function EditorErrorPanel({ error, raw, onRawEdit, mdPath }: Readonly<Props>) {
  return (
    <div className="editor-error">
      <h2>无法打开此导图</h2>
      <p className="error-detail">{error}</p>
      <pre className="raw-preview">{raw}</pre>
      <button type="button" data-testid="btn-raw-edit" onClick={() => onRawEdit(mdPath)}>
        以纯文本打开修复
      </button>
    </div>
  )
}
