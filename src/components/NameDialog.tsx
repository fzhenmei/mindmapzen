import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface Props {
  title: string
  initial?: string
  confirmText: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

/** 命名对话框（M12b Task 5 切 ui/dialog + ui/input）：Esc/✕/遮罩点击 → onCancel */
export default function NameDialog({ title, initial = '', confirmText, onConfirm, onCancel }: Readonly<Props>) {
  const [value, setValue] = useState(initial)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <Input data-testid="input-name" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" data-testid="btn-confirm" onClick={() => onConfirm(value.trim())}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
