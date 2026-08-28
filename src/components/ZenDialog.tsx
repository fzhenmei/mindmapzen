import { useEffect, useRef, type ReactNode } from 'react'

interface ZenDialogProps {
  title: string
  testid?: string
  onClose?: () => void
  /** 可省：纯抉择对话框（如关闭守卫三态）只有标题与操作行 */
  children?: ReactNode
  actions?: ReactNode
}

/** 统一对话框：原生 <dialog>（清 S6819）。互斥由调用方保证——每视图同时至多一个。
 *  Esc 走原生 'cancel' 事件 → onClose（用户取消语义）；卸载清理只调 el.close()
 *  （DOM 关闭，派发 'close' 而非 'cancel'），不会误触 onClose、无双重回调 */
export default function ZenDialog({ title, testid, onClose, children, actions }: Readonly<ZenDialogProps>) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof el.showModal === 'function') el.showModal()
    else el.setAttribute('open', '') // jsdom 兜底：无 showModal 时保持可查询
    const oncancel = (e: Event) => {
      e.preventDefault()
      onClose?.()
    }
    el.addEventListener('cancel', oncancel)
    return () => {
      el.removeEventListener('cancel', oncancel)
      if (typeof el.close === 'function') el.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载期开闭一次，内容由外部 state 控制
  }, [])
  return (
    <dialog ref={ref} data-testid={testid} className="zen-dialog" aria-label={title}>
      <h3>{title}</h3>
      {children !== undefined && <div className="zen-dialog-body">{children}</div>}
      {actions !== undefined && <div className="zen-dialog-actions">{actions}</div>}
    </dialog>
  )
}
