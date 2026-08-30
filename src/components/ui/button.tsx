import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** Button（shadcn 约定，源码入仓库）：variant default/secondary/ghost/destructive、
 *  size sm/default/icon，皮肤纯青松令牌工具类（theme.css @theme）。
 *  行高对齐案头基准（default 32px / icon 32px 方钮）；主色底用 primary-soft 作字色，
 *  晨松=深底浅字、夜航=浅底深字，同一对令牌双主题自洽。 */
type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'default' | 'icon'

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

const buttonVariants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border border-border bg-card text-foreground hover:border-primary hover:text-primary',
  ghost: 'text-foreground hover:bg-secondary hover:text-primary',
  destructive: 'bg-destructive text-white hover:opacity-90',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3',
  default: 'h-8 px-4',
  icon: 'size-8',
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** asChild：把皮肤并到子元素上（Radix Slot），shadcn 约定 */
  asChild?: boolean
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-testid="ui-button"
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  )
}
