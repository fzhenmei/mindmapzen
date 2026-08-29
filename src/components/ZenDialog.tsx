import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'

interface ZenDialogProps {
  title: string
  testid?: string
  onClose?: () => void
  /** 可省：纯抉择对话框（如关闭守卫三态）只有标题与操作行 */
  children?: ReactNode
  actions?: ReactNode
  /** 关闭出口（默认 true）：右上角 ✕ + Esc/遮罩点击 → onClose——用户永远保有"什么都不做"的权力。
   *  false 为强制抉择对话框：无 ✕，Esc/遮罩被拦截（必须点操作行的按钮） */
  dismissable?: boolean
}

/** 统一对话框：Radix Dialog 原语做交互底层（焦点陷阱/滚动锁定/Esc 白送），皮肤仍用我们的 tokens。
 *  外部条件渲染（挂载即开）：Root open 恒 true，关闭统一走 onOpenChange(false) → onClose——
 *  卸载（父组件收框）由调用方 state 决定，本组件不持有开态。
 *  互斥由调用方保证——每视图同时至多一个。 */
export default function ZenDialog({
  title,
  testid,
  onClose,
  children,
  actions,
  dismissable = true,
}: Readonly<ZenDialogProps>) {
  // 强制对话框：拦截 Esc/遮罩点击，onOpenChange(false) 不会发生；可关闭时放行 → onClose
  const guard = (e: Event) => {
    if (!dismissable) e.preventDefault()
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose?.()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="zen-dialog-overlay" />
        <Dialog.Content
          data-testid={testid}
          className="zen-dialog"
          aria-label={title}
          onEscapeKeyDown={guard}
          onPointerDownOutside={guard}
          onInteractOutside={guard}
        >
          <Dialog.Title asChild>
            <h3>{title}</h3>
          </Dialog.Title>
          {dismissable && onClose && (
            <Dialog.Close asChild>
              <button
                type="button"
                data-testid="zen-dialog-close"
                className="zen-dialog-close"
                aria-label="关闭"
              >
                ✕
              </button>
            </Dialog.Close>
          )}
          {children !== undefined && <div className="zen-dialog-body">{children}</div>}
          {actions !== undefined && <div className="zen-dialog-actions">{actions}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
