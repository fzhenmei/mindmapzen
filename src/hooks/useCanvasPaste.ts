// src/hooks/useCanvasPaste.ts —— 画布态粘贴装配（2026-09 宿主接管 Control+v，EditorView 行数护栏拆出）：
// 图片：paste 事件 clipboardData 同步读 bytes（免 navigator.clipboard.read 权限弹窗）→
// imageEdit.pasteToNodes 逐选中节点落盘 assets/ 应用；文本：canvasPaste 分派（smm 节点
// 还原/建子节点）。无图/无选中静默 no-op（同引擎原生 paste 语义）。
import { useCallback, type RefObject } from 'react'
import type { MindMapHandle } from '../types/engine'
import { pasteTextToCanvas } from '../editor/canvasPaste'
import { bytesFromPasteEvent } from '../services/pasteImage'
import type { PickedImage } from './useImageEdit'

/** EditorCanvasArea 粘贴两回调（形态与 MindMapCanvas 同名 props 一致） */
export interface CanvasPasteHandlers {
  onCanvasImagePaste(clipboardData: DataTransfer): void
  onCanvasPasteText(text: string): void
}

export function useCanvasPaste(
  mmRef: RefObject<MindMapHandle | null>,
  activeUidsRef: RefObject<readonly string[]>,
  pasteToNodes: (uids: readonly string[], image: PickedImage) => Promise<void>,
): CanvasPasteHandlers {
  // bytes 读取为异步（file.arrayBuffer），落盘链由 pasteToNodes 内部处理；此处仅装配
  const onCanvasImagePaste = useCallback(
    (cd: DataTransfer) => {
      void (async () => {
        const image = await bytesFromPasteEvent({ clipboardData: cd })
        if (image === null) return
        await pasteToNodes(activeUidsRef.current, image)
      })()
    },
    [activeUidsRef, pasteToNodes],
  )
  const onCanvasPasteText = useCallback((text: string) => {
    const mm = mmRef.current
    if (mm !== null) pasteTextToCanvas(mm, text)
  }, [mmRef])
  return { onCanvasImagePaste, onCanvasPasteText }
}
