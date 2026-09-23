// src/components/ExportDialog.tsx —— 导出入口对话框（M5b Task 5）：三入口
//（导出 PNG / 导出 SVG / 复制为图片）；2026-09-23 导出 Word/PDF 批加文档两入口。
// 动作处理在 useExportFlow（宿主经 EditorDialogs 注入），
// 本组件纯展示；Esc/✕ 经 ui Dialog → onOpenChange(false) → onClose，另有显式取消按钮（想法4 取消权）。
import { useTranslation } from 'react-i18next'
import type { ExportActions } from '../hooks/useExportFlow'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

/** 导出对话框：入口按钮纵排（PNG 为常用主路径走 primary，其余 secondary），
 *  均触发后由宿主先收框再异步执行（成功印记/失败横幅） */
export default function ExportDialog({ actions }: Readonly<{ actions: ExportActions }>) {
  const { t } = useTranslation()
  const title = t('editor.export.title')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) actions.onClose() }}>
      <DialogContent data-testid="export-dialog" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="export-cancel" onClick={actions.onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="export-png" onClick={actions.onPng}>
            {t('editor.export.png')}
          </Button>
          <Button variant="secondary" size="sm" data-testid="export-svg" onClick={actions.onSvg}>
            {t('editor.export.svg')}
          </Button>
          <Button variant="secondary" size="sm" data-testid="export-copy" onClick={actions.onCopy}>
            {t('editor.export.copy')}
          </Button>
          <Button variant="secondary" size="sm" data-testid="export-word" onClick={actions.onWord}>
            {t('editor.export.word')}
          </Button>
          <Button variant="secondary" size="sm" data-testid="export-pdf" onClick={actions.onPdf}>
            {t('editor.export.pdf')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
