// src/components/NodeActions.tsx —— 选中节点浮动操作条（验收轮）：备注笔 + 连线箭头两钮，
// 锚定选中节点右下角（几何由 useNodeActions 计算）。纯展示组件：定位/显隐状态全在 hook 与父级，
// 不必记快捷键即可加备注/拉连线。M14 Task 5 钮体换 ui Button(ghost,icon) + ui Tooltip
// （官方默认内距），z-index 8 低于命令栏 10/横幅 9；容器仍是节点语境的锚定浮条。
import type { NodeActionPos } from '../hooks/useNodeActions'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconLink, IconPencil } from './icons'

interface Props {
  /** 锚点（useNodeActions 产出；仅在有值时由父级渲染本组件） */
  pos: NodeActionPos
  /** 编辑选中节点备注（复用命令栏 btn-note 同一 useNoteEdit 流） */
  onNoteClick(): void
  /** 发起连线（引擎建线态 → 点目标节点经 linkBridge 落 [[..]] 文本） */
  onLinkClick(): void
}

export default function NodeActions({ pos, onNoteClick, onLinkClick }: Readonly<Props>) {
  return (
    <div
      data-testid="node-actions"
      className="absolute z-[8] flex items-center gap-0.5 rounded-[10px] border border-border bg-card px-1.5 py-1 shadow-sm"
      style={{ left: pos.left, top: pos.top }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-note"
            aria-label="编辑该节点备注（Shift+F2）"
            onClick={onNoteClick}
          >
            <IconPencil />
          </Button>
        </TooltipTrigger>
        <TooltipContent>编辑该节点备注（Shift+F2）</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-link"
            aria-label="创建连线：点此钮后再点目标节点"
            onClick={onLinkClick}
          >
            <IconLink />
          </Button>
        </TooltipTrigger>
        <TooltipContent>创建连线：点此钮后再点目标节点</TooltipContent>
      </Tooltip>
    </div>
  )
}
