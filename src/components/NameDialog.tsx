import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface Props {
  title: string
  initial?: string
  confirmText: string
  /** 确认（M16 抛错语义）：resolve = 成功（调用方在成功路径上关框）；抛错 = 对话框
   *  就地显示 error.message、不关框——输入类错误不再散落到全局 banner */
  onConfirm: (name: string) => void | Promise<void>
  onCancel: () => void
}

/** 命名对话框（M12b 切 ui/dialog + ui/input → M16 内联错误）：Esc/✕/遮罩点击 → onCancel；
 *  空名本地拦截（不发起确认），服务层错误框内 destructive 小字提示，对话框保持打开 */
export default function NameDialog({ title, initial = '', confirmText, onConfirm, onCancel }: Readonly<Props>) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setError(null)
    if (value.trim() === '') {
      setError('名称不能为空')
      return
    }
    try {
      await onConfirm(value.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <Input
          data-testid="input-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          autoFocus
        />
        {error !== null && (
          <p data-testid="dialog-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" data-testid="btn-confirm" onClick={() => void submit()}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
