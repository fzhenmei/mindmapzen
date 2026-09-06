import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface Props {
  mapName: string
  onChoice: (c: 'overwrite' | 'reload' | 'cancel') => void
}

/** 冲突裁决三态对话框（多实例/外部编辑器改盘的保存前拦截）：
 *  Esc/✕/遮罩点击与「取消」同义 → onChoice('cancel')（暂不保存，保脏留待再决策）；
 *  「以磁盘版为准」放弃当前未保存修改并重载磁盘版（放弃内存编辑走 secondary）；
 *  「覆盖磁盘版」以当前修改覆盖磁盘文件（丢对方已落盘变更，破坏性出口走朱砂 destructive） */
export default function ConflictDialog({ mapName, onChoice }: Readonly<Props>) {
  const { t } = useTranslation()
  const title = t('settings.conflict.title', { name: mapName })
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onChoice('cancel') }}>
      <DialogContent data-testid="conflict-dialog" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <p className="text-sm text-muted-foreground">{t('settings.conflict.body')}</p>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="conflict-cancel" onClick={() => onChoice('cancel')}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="conflict-reload" onClick={() => onChoice('reload')}>
            {t('settings.conflict.keepDisk')}
          </Button>
          <Button variant="destructive" size="sm" data-testid="conflict-overwrite" onClick={() => onChoice('overwrite')}>
            {t('settings.conflict.overwriteDisk')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
