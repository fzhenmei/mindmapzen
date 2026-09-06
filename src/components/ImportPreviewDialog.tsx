import { useTranslation } from 'react-i18next'
import { describeIgnoredType } from '../services/ignoredType'
import type { IgnoredBlock, ZenNode } from '../types/tree'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'

/** 导入预览挂起态：解析成功但存在忽略块，待用户确认后才入库（取消则丢弃） */
export interface ImportPreview {
  name: string
  tree: ZenNode
  blocks: IgnoredBlock[]
}

interface Props {
  preview: ImportPreview
  onCancel(): void
  onConfirm(): void
}

/** 导入预览确认框（M21 双流共用；2026-09 自 LibraryView 抽取）：未映射内容块先列
 *  摘要（类型 + 节选），确认才入库 */
export default function ImportPreviewDialog({ preview, onCancel, onConfirm }: Readonly<Props>) {
  const { t } = useTranslation()
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="import-preview" aria-label={t('library.dialogs.importPreview.title', { name: preview.name })}>
        <DialogTitle>{t('library.dialogs.importPreview.title', { name: preview.name })}</DialogTitle>
        <p className="text-sm">{t('library.dialogs.importPreview.body', { count: preview.blocks.length })}</p>
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {preview.blocks.map((b) => (
            <li key={`${b.type}:${b.excerpt}`}>
              {t('library.dialogs.importPreview.item', { type: describeIgnoredType(b.type), excerpt: b.excerpt })}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="import-cancel" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="import-confirm" onClick={onConfirm}>
            {t('library.dialogs.importPreview.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
