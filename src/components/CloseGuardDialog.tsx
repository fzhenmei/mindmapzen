import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface Props {
  mapName: string
  onChoice: (c: 'save' | 'discard' | 'cancel') => void
}

/** 关闭守卫三态对话框（M12b Task 5 切 ui/dialog）：Esc/✕/遮罩点击与「取消」按钮同义 → onChoice('cancel')；
 *  「放弃修改」为破坏性出口走朱砂（brand），「保存并关闭」为主操作走青松（primary） */
export default function CloseGuardDialog({ mapName, onChoice }: Readonly<Props>) {
  const title = `「${mapName}」有未保存的修改`
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChoice('cancel') }}>
      <DialogContent data-testid="closeguard-dialog" aria-label={title} className="w-90 gap-3 p-5">
        <DialogTitle>{title}</DialogTitle>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="closeguard-cancel" onClick={() => onChoice('cancel')}>
            取消
          </Button>
          <Button variant="destructive" size="sm" data-testid="closeguard-discard" onClick={() => onChoice('discard')}>
            放弃修改
          </Button>
          <Button size="sm" data-testid="closeguard-save" onClick={() => onChoice('save')}>
            保存并关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
