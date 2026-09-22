// src/components/NodeActions.tsx —— 选中节点浮动操作条（验收轮）：正文笔 + 连线箭头等钮，
// 锚定选中节点右下角（几何由 useNodeActions 计算）。纯展示组件：定位/显隐状态全在 hook 与父级，
// 不必记快捷键即可写正文/拉连线。M14 Task 5 钮体换 ui Button(ghost,icon) + ui Tooltip
// （官方默认内距），z-index 8 低于命令栏 10/横幅 9；容器仍是节点语境的锚定浮条。
// 2026-09-06 备注合并：备注笔退役，首钮改指正文面板（与砚栏 btn-body 同一 toggle 流）。
// 2026-09-22 边缘浮层修复：节点在容器右/下缘时锚点溢出、浮条被视口裁剪不可见——
// 渲染后按实测尺寸钳进 offsetParent(.editor)，锚点在界内时零位移。
import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeActionPos } from '../hooks/useNodeActions'
import { clampOverlayPos } from '../lib/utils'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconCircleDot, IconFileText, IconImage, IconLink, IconSmile, IconTag } from './icons'

interface Props {
  /** 锚点（useNodeActions 产出；仅在有值时由父级渲染本组件） */
  pos: NodeActionPos
  /** 打开正文弹窗（复用命令栏 btn-body 同一 useBodyDialog.toggle 流） */
  onBodyClick(): void
  /** 发起连线（引擎建线态 → 点目标节点经 linkBridge 落 [[..]] 文本） */
  onLinkClick(): void
  /** 图标管理器（M18 想法9：节点签名图标的唯一增删 UI 通道） */
  onIconClick(): void
  /** 插图（M19 想法10：选图/换图/移除） */
  onImageClick(): void
  /** 标签选择器（节点标签的唯一增删 UI 通道） */
  onTagClick(): void
  /** 状态选择器（2026-09 看板模式 Task 8：导图侧任务状态入口，六态单选 + 转普通） */
  onStatusClick(): void
}

export default function NodeActions({ pos, onBodyClick, onLinkClick, onIconClick, onImageClick, onTagClick, onStatusClick }: Readonly<Props>) {
  const { t } = useTranslation()
  const barRef = useRef<HTMLDivElement>(null)
  // 渲染后钳制（无依赖数组：锚点每次变化都重测重钳）。边界宿主 = offsetParent（定位
  // 上下文 .editor；jsdom 未实现 offsetParent 恒 null → 退 parentElement）；宿主量测
  // 恒 0（jsdom 无布局）跳过，保持测试环境定位=锚点原值。useLayoutEffect 绘制前落位，
  // 不闪未钳的原始坐标
  useLayoutEffect(() => {
    const el = barRef.current
    const parent = (el?.offsetParent ?? el?.parentElement) as HTMLElement | null
    if (!el || !parent || parent.clientWidth <= 0) return
    const c = clampOverlayPos(pos.left, pos.top, el.offsetWidth, el.offsetHeight, parent.clientWidth, parent.clientHeight)
    el.style.left = `${c.left}px`
    el.style.top = `${c.top}px`
  })
  return (
    <div
      ref={barRef}
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
            aria-label={t('editor.nodeActions.body')}
            onClick={onBodyClick}
          >
            <IconFileText />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.nodeActions.body')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-icon"
            aria-label={t('editor.nodeActions.icon')}
            onClick={onIconClick}
          >
            <IconSmile />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.nodeActions.icon')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-tag"
            aria-label={t('editor.nodeActions.tag')}
            onClick={onTagClick}
          >
            <IconTag />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.nodeActions.tag')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-status"
            aria-label={t('editor.nodeActions.status')}
            onClick={onStatusClick}
          >
            <IconCircleDot />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.nodeActions.status')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-image"
            aria-label={t('editor.nodeActions.image')}
            onClick={onImageClick}
          >
            <IconImage />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.nodeActions.image')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="node-action-link"
            aria-label={t('editor.nodeActions.link')}
            onClick={onLinkClick}
          >
            <IconLink />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('editor.nodeActions.link')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
