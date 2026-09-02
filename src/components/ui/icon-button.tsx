import type { ComponentType, ReactNode } from 'react'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/** 纯图标动作钮工厂（官方 header 模式骨架）：ui Button ghost sm + Tooltip 悬浮提示 +
 *  aria-label 语义名（title 退役防双提示），testid 逐枚落钮（E2E 兼容）。
 *  页首常驻钮（LibraryView）与案头详情动作组（DetailActions）共用 */
export const iconBtn = (
  label: string,
  testid: string,
  Icon: ComponentType<{ size?: number }>,
  onClick: () => void,
): ReactNode => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button type="button" variant="ghost" size="sm" data-testid={testid} aria-label={label} onClick={onClick}>
        <Icon />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)
