// src/components/NodeActions.tsx —— 选中节点浮动操作条（验收轮）：备注笔 + 连线箭头两钮，
// 锚定选中节点右下角（几何由 useNodeActions 计算）。纯展示组件：定位/显隐状态全在 hook 与父级，
// 不必记快捷键即可加备注/拉连线（zen 视觉：小浮条，z-index 8，低于砚栏 10/横幅 9）。
import type { NodeActionPos } from '../hooks/useNodeActions'
import { IconLink, IconPencil } from './icons'

interface Props {
  /** 锚点（useNodeActions 产出；仅在有值时由父级渲染本组件） */
  pos: NodeActionPos
  /** 编辑选中节点备注（复用砚栏 btn-note 同一 useNoteEdit 流） */
  onNoteClick(): void
  /** 发起连线（引擎建线态 → 点目标节点经 linkBridge 落 [[..]] 文本） */
  onLinkClick(): void
}

export default function NodeActions({ pos, onNoteClick, onLinkClick }: Readonly<Props>) {
  return (
    <div className="node-actions" data-testid="node-actions" style={{ left: pos.left, top: pos.top }}>
      <button type="button" data-testid="node-action-note" title="编辑该节点备注（Shift+F2）" onClick={onNoteClick}>
        <IconPencil />
      </button>
      <button
        type="button"
        data-testid="node-action-link"
        title="创建连线：点此钮后再点目标节点"
        onClick={onLinkClick}
      >
        <IconLink />
      </button>
    </div>
  )
}
