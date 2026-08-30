import { Select as SelectPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** Select（shadcn 约定，源码入仓库）：Radix Select 原语 + 青松令牌皮肤。
 *  触发器 32px 行高对齐案头基准；弹层卡片规格同 dropdown-menu。 */

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-testid="ui-select-trigger"
      className={cn(
        'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 font-sans text-sm text-foreground transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-testid="ui-select-content"
        position={position}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-96 min-w-32 overflow-hidden rounded-lg border border-border bg-card font-sans text-sm text-foreground shadow-md',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-testid="ui-select-item"
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-2 pr-8 outline-none transition-colors duration-150 data-[state=checked]:font-medium data-[highlighted]:bg-secondary data-[highlighted]:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
