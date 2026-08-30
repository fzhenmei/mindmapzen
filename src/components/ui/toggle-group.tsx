import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** ToggleGroup（shadcn 约定，源码入仓库）：Radix ToggleGroup 原语 + 青松令牌皮肤。
 *  选中态：primary 边 + primary-soft 底 + primary 字（与 ghost 按钮 hover 同语言）。 */

export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-testid="ui-toggle-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  )
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-testid="ui-toggle-item"
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-card px-3 font-sans text-sm text-foreground transition-colors duration-150 hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-primary data-[state=on]:bg-secondary data-[state=on]:text-primary',
        className,
      )}
      {...props}
    />
  )
}
