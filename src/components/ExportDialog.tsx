// src/components/ExportDialog.tsx —— 导出入口对话框（M5b Task 5）：ZenDialog 三入口
//（导出 PNG / 导出 SVG / 复制为图片）。动作处理在 useExportFlow（宿主经 EditorDialogs 注入），
// 本组件纯展示；Esc 经 ZenDialog 原生 cancel → onClose。
import type { ExportActions } from '../hooks/useExportFlow'
import ZenDialog from './ZenDialog'

/** 导出对话框：三入口按钮纵排，均触发后由宿主先收框再异步执行（成功印记/失败横幅） */
export default function ExportDialog({ actions }: Readonly<{ actions: ExportActions }>) {
  return (
    <ZenDialog
      testid="export-dialog"
      title="导出或复制图片"
      onClose={actions.onClose}
      actions={
        <>
          <button type="button" data-testid="export-png" onClick={actions.onPng}>
            导出 PNG
          </button>
          <button type="button" data-testid="export-svg" onClick={actions.onSvg}>
            导出 SVG
          </button>
          <button type="button" data-testid="export-copy" onClick={actions.onCopy}>
            复制为图片
          </button>
        </>
      }
    />
  )
}
