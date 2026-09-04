import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'

interface Props {
  /** 确认框标题（含目标名） */
  title: string
  /** 危险说明（报数/去向） */
  body: string
  onCancel(): void
  onConfirm(): void
}

/** 删除类二次确认框（2026-09 抽取共享壳）：导图删除/目录删除同壳——标题 + 说明 +
 *  取消/删除（destructive）。btn-delete-confirm testid 为两流共用契约 */
export default function DeleteConfirmDialog({ title, body, onCancel, onConfirm }: Readonly<Props>) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <p className="text-sm">{body}</p>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="destructive" size="sm" data-testid="btn-delete-confirm" onClick={onConfirm}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
