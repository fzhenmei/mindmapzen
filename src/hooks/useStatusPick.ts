// src/hooks/useStatusPick.ts —— 状态选择器（2026-09 看板模式 Task 8 拆自 EditorView，
// 2026-09 画布三态 M1 因行数护栏移出）：statusPick 快照 + applyStatus 落命令。
// 语义注释见原段（execOnRenderNode 渲染节点寻址 / getData 快照读现值 / 命令落地后
// onTreeDataChange / 同态短路不占 undo）
import { useState, type RefObject } from 'react'
import type { MindMapHandle } from '../types/engine'
import type { TaskStatus } from '../services/statusMarkers'
import { findByUid } from './useIconPicker'
import { execOnRenderNode, mergeStatusBadge, nodeStatusOf } from '../services/statusOps'

export interface StatusPick { uid: string; text: string; current: TaskStatus | null }

export function useStatusPick(
  mmRef: RefObject<MindMapHandle | null>,
  onDataChanged: () => void,
): {
  statusPick: StatusPick | null
  setStatusPick: (v: StatusPick | null) => void
  applyStatus: (uid: string, status: TaskStatus | null) => void
} {
  const [statusPick, setStatusPick] = useState<StatusPick | null>(null)

  const applyStatus = (uid: string, status: TaskStatus | null): void => {
    const mm = mmRef.current
    setStatusPick(null)
    if (mm === null) return
    if (nodeStatusOf(mm, uid) === status) return
    const currentIcon = findByUid(mm.getData(), uid)?.data.icon
    execOnRenderNode(mm, uid, '改状态', (node) => {
      ;(node as { setIcon?(icons: string[]): void })?.setIcon?.(mergeStatusBadge(currentIcon, status))
      onDataChanged()
    })
  }

  return { statusPick, setStatusPick, applyStatus }
}
