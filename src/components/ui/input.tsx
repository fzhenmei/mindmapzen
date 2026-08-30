import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** Input（shadcn 约定，源码入仓库）：青松令牌皮肤——surface 底、border 边、
 *  32px 行高（h-8）对齐案头基准，焦点环 ring 2px。 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-testid="ui-input"
      className={cn(
        'h-8 w-full rounded-md border border-border bg-card px-3 font-sans text-sm text-foreground transition-colors duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
