// src/components/BodyPanel.tsx —— 右侧常驻正文面板（2026-09 写作）：标题=节点文本，
// BodyEditor 主体（Task 5 契约：value/onChange/readOnly，testid body-editor 由其自带），
// 底部字数（中文字符口径：去除空白后的 Unicode 码点数）。无选中空态；深层列表节点空态。
// 状态与命令全在 useBodyPanel（本组件纯展示，props 即其返回值整体展开）；不进 anyDialog
// ——面板与画布并存（spec：常驻侧栏而非对话框）。
import BodyEditor from './BodyEditor'
import type { BodyPanel as BodyPanelState } from '../hooks/useBodyPanel'

/** 空态文案条（无选中 / 深层列表节点两态；muted 底浮于 card 面板上） */
const Hint = ({ text }: Readonly<{ text: string }>) => (
  <p data-testid="body-empty" className="px-4 py-3 text-sm text-muted-foreground">
    {text}
  </p>
)

/** 右侧正文面板：头部（节点文本截断 + 字数 + 收起）+ 空态文案 + 编辑器主体。
 *  nodeText === '' 兼作「无选中」信号（useBodyPanel 载入口径），!editable 且有选中
 *  即深层列表节点（layerIndex≥6 门禁）——两态分别出文案，编辑器恒挂载保布局稳定 */
export default function BodyPanel({ bodyDraft, nodeText, editable, close, edit }: Readonly<BodyPanelState>) {
  const draft = bodyDraft ?? ''
  const count = [...draft.replace(/\s/g, '')].length
  return (
    <aside data-testid="body-panel" className="body-panel" aria-label="节点正文面板">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={nodeText}>
          {nodeText}
        </span>
        <span data-testid="body-wordcount" className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {count} 字
        </span>
        <button
          type="button"
          data-testid="body-close"
          aria-label="收起正文面板"
          onClick={close}
          className="shrink-0 rounded px-1.5 text-base leading-none text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          ×
        </button>
      </header>
      {nodeText === '' ? (
        <Hint text="在画布选中节点后在此撰写正文" />
      ) : !editable ? (
        <Hint text="深层列表节点暂不支持正文" />
      ) : null}
      <BodyEditor value={draft} onChange={edit} readOnly={!editable} />
    </aside>
  )
}
