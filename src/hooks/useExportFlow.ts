// src/hooks/useExportFlow.ts —— 导出与复制为图片（M5b Task 5）：对话框开闭状态与三入口执行链，
// 自 EditorView 拆出（EditorView 行数护栏 ≤300）。导出先经 pickSavePath 选目标路径
//（取消即静默放弃），复制图直接走 writeImage；成功复用印记（导出=「已存」/复制图=「已复制」），
// 失败经 setError 出中文横幅。
// 2026-09-23 导出 Word/PDF：Word/PDF 失败走 toast+console（编辑器侧惯例），
// 现有三入口保持注入 onError（setError 横幅）不变
import { useState, type RefObject } from 'react'
import { i18n } from '../i18n'
import { copyPngToClipboard, exportPngToFile, exportSvgToFile } from '../services/exportImage'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, serialize } from '../services/mdTree'
import { renderPublishBody } from '../services/publishBody'
import { buildDocxFromBody } from '../services/docxExport'
import { showToast } from '../services/toast'
import type { MindMapHandle } from '../types/engine'
import type { ExportPorts } from '../types/ports'
import type { FsAdapter } from '../types/files'
import type { LinkRegistry } from '../editor/linkRegistry'

/** ExportDialog 入口动作（经 EditorDialogs 的 export prop 传入）；onPdf 占位（Task 6 填打印链） */
export interface ExportActions {
  onPng(): void
  onSvg(): void
  onCopy(): void
  onWord(): void
  onPdf(): void
  onClose(): void
}

export interface ExportFlow {
  /** 对话框开状态（EditorDialogs 渲染 ExportDialog 的信号，互斥门闩由 EditorView 组合） */
  open: boolean
  /** 砚栏 btn-export：打开对话框 */
  openExport(): void
  /** 入口动作（各入口先收框再异步执行，结果经印记/横幅反馈） */
  actions: ExportActions
}

export function useExportFlow(
  mmRef: RefObject<MindMapHandle | null>,
  adapter: FsAdapter,
  mapName: string,
  ports: ExportPorts,
  registry: LinkRegistry,
  onSuccess: (kind: 'saved' | 'copied') => void,
  onError: (message: string) => void,
): ExportFlow {
  const [open, setOpen] = useState(false)

  // pickSavePath 返回 null = 用户取消保存对话框：静默放弃（不写盘/不盖印/不报错）；
  // 对话框插件异常与其他导出错误同路进 catch——不挪进 try 会成为未处理拒绝、无横幅
  const runExport = async (kind: 'png' | 'svg'): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    try {
      const savePath = await ports.pickSavePath(`${mapName}.${kind}`)
      if (savePath === null) return
      if (kind === 'png') await exportPngToFile(mm, savePath, adapter.writeBytes.bind(adapter))
      else await exportSvgToFile(mm, savePath, adapter.writeBytes.bind(adapter))
      onSuccess('saved')
    } catch (e) {
      onError(i18n.t('errors.exportFailed', { reason: String(e) }))
    }
  }

  const runCopy = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    try {
      await copyPngToClipboard(mm, ports.writeImage)
      onSuccess('copied')
    } catch (e) {
      onError(i18n.t('errors.copyImageFailed', { reason: String(e) }))
    }
  }

  // 导出 Word/PDF（2026-09-23）：现场 display 序列化（所见即所导出，useWechatCopy 同口径）
  // → pickSavePath（取消静默）→ 渲染中段 → 各自 finisher → 盖「已存」。失败走
  // toast + console（编辑器侧失败出口惯例，不走注入 onError——那是 PNG/SVG/复制图
  // 三入口的 setError 横幅通道，保持不变）；序列化同步失败单独出口（Word 毒节点家族）
  const runDoc = async (kind: 'word' | 'pdf'): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    let md: string
    try {
      md = serialize(engineTreeToZen(mm.getData()).tree, registry.byUid, { display: true })
    } catch (e) {
      console.error(`导出 ${kind === 'word' ? 'Word' : 'PDF'} 失败：序列化`, e)
      showToast(i18n.t('errors.exportFailed', { reason: e instanceof Error ? e.message : String(e) }))
      return
    }
    try {
      const savePath = await ports.pickSavePath(`${mapName}.${kind === 'word' ? 'docx' : 'pdf'}`)
      if (savePath === null) return
      const { workspaceDir } = useAppStore.getState()
      const body = await renderPublishBody(adapter, workspaceDir, md)
      if (kind === 'word') await adapter.writeBytes(savePath, await buildDocxFromBody(body, mapName))
      else {
        /* Task 6：接通打印链 ports.runEdgePrint(buildPrintHtml(body, mapName), savePath) */
      }
      onSuccess('saved')
    } catch (e) {
      console.error(`导出 ${kind === 'word' ? 'Word' : 'PDF'} 失败`, e)
      showToast(i18n.t('errors.exportFailed', { reason: String(e) }))
    }
  }

  const fire = (run: () => Promise<void>): void => {
    setOpen(false) // 先收框：保存系统对话框随即接管（对话框互斥约定）
    void run()
  }

  return {
    open,
    openExport: () => setOpen(true),
    actions: {
      onPng: () => fire(() => runExport('png')),
      onSvg: () => fire(() => runExport('svg')),
      onCopy: () => fire(runCopy),
      onWord: () => fire(() => runDoc('word')),
      onPdf: () => fire(() => runDoc('pdf')),
      onClose: () => setOpen(false),
    },
  }
}
