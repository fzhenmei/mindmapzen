import type { MindMapHandle, NodeBox } from '../types/engine'

/** 全树包围盒（节点实例坐标为画布内容坐标系下的绝对值） */
function treeBBox(root: NodeBox): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const walk = (n: NodeBox) => {
    minX = Math.min(minX, n.left)
    minY = Math.min(minY, n.top)
    maxX = Math.max(maxX, n.left + n.width)
    maxY = Math.max(maxY, n.top + n.height)
    ;(n.children ?? []).forEach(walk)
  }
  walk(root)
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** 根居中：保持当前缩放，把根节点移到画布中心（大图迷路时快速回到根） */
export function centerRoot(mm: MindMapHandle): void {
  const root = mm.renderer?.root
  const el = mm.el
  if (!root || !el) return
  const cx = root.left + root.width / 2
  const cy = root.top + root.height / 2
  mm.view.x = el.clientWidth / 2 - cx * mm.view.scale
  mm.view.y = el.clientHeight / 2 - cy * mm.view.scale
  mm.view.transform()
}

/** 适配整图：自动缩放使全树完整可见并居中（留 10% 边距，缩放夹在 0.1~2 倍） */
export function fitView(mm: MindMapHandle): void {
  const root = mm.renderer?.root
  const el = mm.el
  if (!root || !el) return
  const bbox = treeBBox(root)
  if (bbox.w <= 0 || bbox.h <= 0) return
  const raw = Math.min(el.clientWidth / bbox.w, el.clientHeight / bbox.h) * 0.9
  const scale = Math.max(0.1, Math.min(2, raw))
  mm.view.scale = scale
  mm.view.x = el.clientWidth / 2 - (bbox.x + bbox.w / 2) * scale
  mm.view.y = el.clientHeight / 2 - (bbox.y + bbox.h / 2) * scale
  mm.view.transform()
}
