import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** Tooltip（shadcn 约定，源码入仓库）：Radix Tooltip 原语 + 青松令牌皮肤。
 *  与 ZenTooltip 同款驱动语义（pointerMove + 300ms 延迟）；语义名由触发元素自身承担，
 *  浮签只做视觉提示。 */

export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPrimitive.Provider>
  )
}

export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-testid="ui-tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-control bg-surface px-2 py-1 font-ui text-xs text-foreground shadow-overlay',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
