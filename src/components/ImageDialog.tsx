import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { IconImage, IconPaste, IconTrash } from './icons'
import type { NodeImage } from '../services/imageMarkers'
import { bytesFromPasteEvent } from '../services/pasteImage'
import type { PickedImage } from '../hooks/useImageEdit'

interface Props {
  nodeText: string
  /** 现有插图（null = 无图） */
  current: NodeImage | null
  /** 现图预览 dataURL（null = 无图或文件不可读） */
  preview: string | null
  /** 粘贴错误提示（null = 无） */
  pasteError: string | null
  /** 选择新图（复制入 assets/ 并应用到引擎）；对话框保持打开（可连续换图） */
  onPick(): void
  /** Ctrl+V 粘贴：bytes 已由 paste 事件提取（null = 剪贴板无图） */
  onPaste(image: PickedImage | null): void
  /** 「粘贴」按钮：读剪贴板并应用（无 paste 事件可用的路径） */
  onPasteClick(): void
  /** 移除插图（同时关框） */
  onRemove(): void
  onCancel(): void
}

/** 节点插图对话框（M19 想法10「用图交流」）：现图预览 + 选择新图/粘贴截图（覆盖式）/ 移除。
 *  粘贴双入口：Ctrl+V（paste 事件同步读 items，微信/QQ 截图最可靠路径）与「粘贴」按钮
 *  （Tauri 剪贴板端口）。md 行尾 ![alt](src) 是唯一事实源——AI 也可直接改 md 换图 */
export default function ImageDialog({ nodeText, current, preview, pasteError, onPick, onPaste, onPasteClick, onRemove, onCancel }: Readonly<Props>) {
  const hasImage = current !== null
  const handlePaste = (e: React.ClipboardEvent): void => {
    e.preventDefault()
    void bytesFromPasteEvent(e).then(onPaste)
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="image-dialog" aria-label="节点插图" className="sm:max-w-xl" onPaste={handlePaste}>
        <DialogTitle>节点插图</DialogTitle>
        <p className="truncate text-xs text-muted-foreground" title={nodeText}>
          {nodeText}
        </p>
        {/* 预览区：muted 下陷底；无图占位；有图但不可读提示（文件被移走等） */}
        <div
          data-testid="image-preview"
          className="flex min-h-40 items-center justify-center overflow-auto rounded-md bg-muted p-3"
        >
          {preview !== null ? (
            <img src={preview} alt={current?.alt ?? ''} className="max-h-64 max-w-full rounded" />
          ) : hasImage ? (
            <span className="text-sm text-destructive" data-testid="image-missing">
              图片文件不可读：{current?.src}
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <IconImage size={32} />
              未设置插图
            </span>
          )}
        </div>
        {pasteError !== null && (
          <p data-testid="paste-error" className="text-xs text-amber-600">
            {pasteError}
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="image-remove"
            disabled={!hasImage}
            onClick={onRemove}
          >
            <IconTrash />
            移除
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              关闭
            </Button>
            <Button type="button" variant="secondary" size="sm" data-testid="image-paste" onClick={onPasteClick}>
              <IconPaste />
              粘贴
            </Button>
            <Button type="button" size="sm" data-testid="image-pick" onClick={onPick}>
              选择图片
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
