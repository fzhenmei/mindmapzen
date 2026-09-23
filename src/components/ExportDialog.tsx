// src/components/ExportDialog.tsx —— 导出入口对话框（M5b Task 5）；2026-09-23 导出
// Word/PDF 批加文档两入口，同批改两组两列网格（图片组：PNG/SVG/复制为图片；文档组：
// Word/PDF）——旧 DialogFooter 六钮横排在窄窗溢出。动作处理在 useExportFlow（宿主经
// EditorDialogs 注入），本组件纯展示；Esc/✕ 经 ui Dialog → onOpenChange(false) →
// onClose，另有显式取消按钮（想法4 取消权）。
import { useTranslation } from 'react-i18next'
import type { ExportActions } from '../hooks/useExportFlow'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { IconCopy, IconFilePdf, IconFileWord, IconImage, IconVector } from './icons'

/** 入口按钮形态：纵排图标 + 文字（h-auto + py-3 撑高，占满所在网格列宽） */
const entryClass = 'h-auto flex-col items-center gap-1.5 py-3'

/** 导出对话框：两组两列网格，入口纵排图标+文字（PNG 为常用主路径走 primary，其余
 *  secondary，复制为图片独占一行）；均触发后由宿主先收框再异步执行（成功印记/失败横幅） */
export default function ExportDialog({ actions }: Readonly<{ actions: ExportActions }>) {
  const { t } = useTranslation()
  const title = t('editor.export.title')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) actions.onClose() }}>
      <DialogContent data-testid="export-dialog" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <div className="space-y-4">
          <section className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('editor.export.groupImage')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid="export-png" className={entryClass} onClick={actions.onPng}>
                <IconImage />
                <span>{t('editor.export.png')}</span>
              </Button>
              <Button variant="secondary" data-testid="export-svg" className={entryClass} onClick={actions.onSvg}>
                <IconVector />
                <span>{t('editor.export.svg')}</span>
              </Button>
              <Button variant="secondary" data-testid="export-copy" className={`${entryClass} col-span-2`} onClick={actions.onCopy}>
                <IconCopy />
                <span>{t('editor.export.copy')}</span>
              </Button>
            </div>
          </section>
          <section className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('editor.export.groupDoc')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" data-testid="export-word" className={entryClass} onClick={actions.onWord}>
                <IconFileWord />
                <span>{t('editor.export.word')}</span>
              </Button>
              <Button variant="secondary" data-testid="export-pdf" className={entryClass} onClick={actions.onPdf}>
                <IconFilePdf />
                <span>{t('editor.export.pdf')}</span>
              </Button>
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="export-cancel" onClick={actions.onClose}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
