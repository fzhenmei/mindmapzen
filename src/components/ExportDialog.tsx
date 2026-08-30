// src/components/ExportDialog.tsx —— 导出入口对话框（M5b Task 5）：三入口
//（导出 PNG / 导出 SVG / 复制为图片）。动作处理在 useExportFlow（宿主经 EditorDialogs 注入），
// 本组件纯展示；Esc/✕ 经 ui Dialog → onOpenChange(false) → onClose，另有显式取消按钮（想法4 取消权）。
import type { ExportActions } from '../hooks/useExportFlow'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

/** 导出对话框：三入口按钮纵排（PNG 为常用主路径走 primary，其余 secondary），
 *  均触发后由宿主先收框再异步执行（成功印记/失败横幅） */
export default function ExportDialog({ actions }: Readonly<{ actions: ExportActions }>) {
  const title = '导出或复制图片'
  return (
    <Dialog open onOpenChange={(o) => { if (!o) actions.onClose() }}>
      <DialogContent data-testid="export-dialog" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="export-cancel" onClick={actions.onClose}>
            取消
          </Button>
          <Button size="sm" data-testid="export-png" onClick={actions.onPng}>
            导出 PNG
          </Button>
          <Button variant="secondary" size="sm" data-testid="export-svg" onClick={actions.onSvg}>
            导出 SVG
          </Button>
          <Button variant="secondary" size="sm" data-testid="export-copy" onClick={actions.onCopy}>
            复制为图片
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
