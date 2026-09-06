// src/components/NodeActions.tsx —— 选中节点浮动操作条（验收轮）：正文笔 + 连线箭头等钮，
// 锚定选中节点右下角（几何由 useNodeActions 计算）。纯展示组件：定位/显隐状态全在 hook 与父级，
// 不必记快捷键即可写正文/拉连线。M14 Task 5 钮体换 ui Button(ghost,icon) + ui Tooltip
// （官方默认内距），z-index 8 低于命令栏 10/横幅 9；容器仍是节点语境的锚定浮条。
// 2026-09-06 备注合并：备注笔退役，首钮改指正文面板（与砚栏 btn-body 同一 toggle 流）。
import type { NodeActionPos } from '../hooks/useNodeActions'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconFileText, IconImage, IconLink, IconSmile } from './icons'

interface Props {
  /** 锚点（useNodeActions 产出；仅在有值时由父级渲染本组件） */
  pos: NodeActionPos
  /** 打开正文面板（复用命令栏 btn-body 同一 useBodyPanel.toggle 流） */
  onBodyClick(): void
  /** 发起连线（引擎建线态 → 点目标节点经 linkBridge 落 [[..]] 文本） */
  onLinkClick(): void
  /** 图标管理器（M18 想法9：节点签名图标的唯一增删 UI 通道） */
  onIconClick(): void
  /** 插图（M19 想法10：选图/换图/移除） */
  onImageClick(): void
}

export default function NodeActions({ pos, onBodyClick, onLinkClick, onIconClick, onImageClick }: Readonly<Props>) {
  return (
    <div
      data-testid="node-actions"
      className="absolute z-[8] flex items-center gap-0.5 rounded-lg bg-card px-1.5 py-1 shadow-md"
      style={{ left: pos.left, top: pos.top }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-body"
            aria-label="编写选中节点的正文"
            onClick={onBodyClick}
          >
            <IconFileText />
          </Button>
        </TooltipTrigger>
        <TooltipContent>编写选中节点的正文</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-icon"
            aria-label="节点图标"
            onClick={onIconClick}
          >
            <IconSmile />
          </Button>
        </TooltipTrigger>
        <TooltipContent>节点图标</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-image"
            aria-label="节点插图"
            onClick={onImageClick}
          >
            <IconImage />
          </Button>
        </TooltipTrigger>
        <TooltipContent>节点插图</TooltipContent>
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
