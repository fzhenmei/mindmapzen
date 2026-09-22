import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 约定的类名工具：clsx 负责合并（数组/条件/假值滤除），tailwind-merge
 *  负责冲突消解（同组工具类后者覆盖前者）——调用方 className 恒压过组件内置默认。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** 浮层锚点钳制（2026-09-22 边缘浮层修复）：正文悬停窗 / 节点浮动操作条共用——
 *  锚点坐标 + 浮层实测尺寸收进 [margin, bound-size-margin]（TourOverlay.popoverPos
 *  惯用法的泛化）。边界放不下（浮层大于边界）退到 margin 贴边，优先保可见不产生负坐标。 */
export function clampOverlayPos(
  left: number,
  top: number,
  w: number,
  h: number,
  boundW: number,
  boundH: number,
  margin = 8,
): { left: number; top: number } {
  const maxLeft = Math.max(boundW - w - margin, margin)
  const maxTop = Math.max(boundH - h - margin, margin)
  return { left: Math.min(Math.max(left, margin), maxLeft), top: Math.min(Math.max(top, margin), maxTop) }
}
