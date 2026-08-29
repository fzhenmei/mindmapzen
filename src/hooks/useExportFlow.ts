// src/hooks/useExportFlow.ts —— 导出与复制为图片（M5b Task 5）：对话框开闭状态与三入口执行链，
// 自 EditorView 拆出（EditorView 行数护栏 ≤300）。导出先经 pickSavePath 选目标路径
//（取消即静默放弃），复制图直接走 writeImage；成功复用印记（导出=「已存」/复制图=「已复制」），
// 失败经 setError 出中文横幅。
import { useState, type RefObject } from 'react'
import { copyPngToClipboard, exportPngToFile, exportSvgToFile } from '../services/exportImage'
import type { MindMapHandle } from '../types/engine'
import type { ExportPorts } from '../types/ports'

/** 二进制写盘依赖（FsAdapter.writeBytes 的最小面） */
type WriteBytesDeps = { writeBytes(p: string, bytes: Uint8Array): Promise<void> }

/** ExportDialog 三入口动作（经 EditorDialogs 的 export prop 传入） */
export interface ExportActions {
  onPng(): void
  onSvg(): void
  onCopy(): void
  onClose(): void
}

export interface ExportFlow {
  /** 对话框开状态（EditorDialogs 渲染 ExportDialog 的信号，互斥门闩由 EditorView 组合） */
  open: boolean
  /** 砚栏 btn-export：打开对话框 */
  openExport(): void
  /** 三入口动作（各入口先收框再异步执行，结果经印记/横幅反馈） */
  actions: ExportActions
}

export function useExportFlow(
  mmRef: RefObject<MindMapHandle | null>,
  adapter: WriteBytesDeps,
  mapName: string,
  ports: ExportPorts,
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
      onError('导出失败：' + String(e))
    }
  }

  const runCopy = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    try {
      await copyPngToClipboard(mm, ports.writeImage)
      onSuccess('copied')
    } catch (e) {
      onError('复制图片失败：' + String(e))
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
      onClose: () => setOpen(false),
    },
  }
}
