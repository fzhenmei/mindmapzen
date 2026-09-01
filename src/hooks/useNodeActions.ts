// src/hooks/useNodeActions.ts —— 选中节点浮动操作条定位（验收轮）：
// 有激活节点时锚定其右下角（容器像素坐标），随编辑/重排/视图平移缩放刷新；
// 状态与定位逻辑在此（EditorView 行数护栏 ≤300），EditorView 只渲染 <NodeActions>。
// 节点 left/top/width/height 为画布内容坐标（NodeBox），容器像素 = 内容 × view.scale + view.x/y
// （View.transform() origin[0,0] 即 draw 变换 {scale, translate:[x,y]}，同引擎 getNodePosInClient 口径）。
import { useEffect, useState, type RefObject } from 'react'
import type { MindMapHandle } from '../types/engine'

/** 操作条锚点（.editor 容器像素坐标；null = 无可锚定/隐藏） */
export interface NodeActionPos {
  left: number
  top: number
}

/** 节点右下角外側 6px 的锚点（纯函数）：几何缺失（未布局/假画布节点）返回 null */
export function computeNodeActionPos(
  node: unknown,
  view?: { x?: number; y?: number; scale?: number } | null,
): NodeActionPos | null {
  const g = node as { left?: unknown; top?: unknown; width?: unknown; height?: unknown } | null
  if (!g) return null
  const nums = [g.left, g.top, g.width, g.height]
  if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const s = typeof view?.scale === 'number' ? view.scale : 1
  const x = typeof view?.x === 'number' ? view.x : 0
  const y = typeof view?.y === 'number' ? view.y : 0
  return { left: ((g.left as number) + (g.width as number)) * s + x, top: ((g.top as number) + (g.height as number)) * s + y + 6 }
}

const samePos = (a: NodeActionPos | null, b: NodeActionPos | null): boolean =>
  a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top)

/** 节点上边中点外扩 8px 的锚点（复制印记 CopyStamp 用，纯函数）：几何缺失返回 null，
 *  换算口径同 computeNodeActionPos（内容坐标 × view.scale + view 平移） */
export function computeNodeStampPos(
  node: unknown,
  view?: { x?: number; y?: number; scale?: number } | null,
): NodeActionPos | null {
  const g = node as { left?: unknown; top?: unknown; width?: unknown; height?: unknown } | null
  if (!g) return null
  const nums = [g.left, g.top, g.width, g.height]
  if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const s = typeof view?.scale === 'number' ? view.scale : 1
  const x = typeof view?.x === 'number' ? view.x : 0
  const y = typeof view?.y === 'number' ? view.y : 0
  return {
    left: ((g.left as number) + (g.width as number) / 2) * s + x,
    top: (g.top as number) * s + y - 8,
  }
}

/** 选中节点浮动操作条锚点：activeUid 变化订阅引擎事件刷新几何；
 *  建线态隐藏（拖线时浮动条跟随悬停目标跳动会遮挡目标节点）。 */
export function useNodeActions(
  mmRef: RefObject<MindMapHandle | null>,
  activeUid: string | null,
): NodeActionPos | null {
  const [pos, setPos] = useState<NodeActionPos | null>(null)
  useEffect(() => {
    const mm = mmRef.current
    if (!mm || !activeUid) {
      setPos(null)
      return
    }
    const uid = activeUid
    const refresh = () => {
      const node = mm.associativeLine?.isCreatingLine
        ? null
        : (mm.renderer?.findNodeByUid(uid) as unknown)
      const next = node ? computeNodeActionPos(node, mm.view) : null
      setPos((prev) => (samePos(prev, next) ? prev : next))
    }
    refresh()
    // data_change（节流，编辑）+ node_tree_render_end（重排完成）+ view_data_change（平移/缩放）+ node_active
    const evs = ['node_active', 'data_change', 'view_data_change', 'node_tree_render_end']
    evs.forEach((e) => mm.on(e, refresh))
    return () => evs.forEach((e) => mm.off(e, refresh))
  }, [activeUid, mmRef])
  return pos
}

/** 浮动条「连线」按钮入口：从当前激活节点发起引擎建线（activeNodeList[0] 为源，
 *  后续点击目标节点经 beforeAssociativeLineConnection 桥接为文本，见 linkBridge.ts） */
export function startLinkFromActive(mm: MindMapHandle | null): void {
  mm?.associativeLine?.createLineFromActiveNode()
}
