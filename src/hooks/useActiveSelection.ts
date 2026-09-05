// src/hooks/useActiveSelection.ts —— 选中跟踪（M5a 拆分自 EditorView，零行为变化）：
// 引擎激活节点 uid 的 ref/state 双轨（ref 供逻辑判断走最新值，state 供按钮文案/样式渲染）
// 与复制前的陈旧 uid 清理兜底。
// 圈选多选（2026-09）：引擎 node_active 第二参为激活列表（圈选时首参为 null），镜像从单 uid
// 扩为 uids 批量——activeUid 退化为「恰好单选」语义：多选时为 null，现有单值下游（浮动条锚点、
// 复制范围、备注/图标 hooks）自然让位不误动作；activeCount 驱动多选浮条（MultiSelectBar）。
import { useRef, useState, type RefObject } from 'react'
import { findSubtreeByUid } from '../services/mdTree'
import type { EngineNode } from '../types/engine'

export interface ActiveSelection {
  /** 当前选中节点 uid（仅供按钮文案/样式渲染；多选时为 null——单节点语义让位） */
  activeUid: string | null
  /** 选中 uid 的 ref 镜像（逻辑判断走 ref，闭包稳定可读最新值；React 19 RefObject.current 可写） */
  activeUidRef: RefObject<string | null>
  /** 全量激活 uid 的 ref 镜像（不随单选语义退化；画布贴图逐节点应用等批量消费方用） */
  activeUidsRef: RefObject<readonly string[]>
  /** 激活节点数（多选浮条显隐依据；0 = 无选中） */
  activeCount: number
  /** 引擎激活节点变化（MindMapCanvas onActiveChange 上报当前激活 uid 列表，空数组 = 无选中） */
  handleActiveChange(uids: readonly string[]): void
  /** 复制兜底：uid 已设置但未命中渲染树（如撤销删除了该节点）时清除选中态（原 doCopy 内联分支） */
  clearStaleIfMissing(root: EngineNode): void
}

export function useActiveSelection(): ActiveSelection {
  const [activeUid, setActiveUid] = useState<string | null>(null) // 仅供按钮文案/样式
  const [activeCount, setActiveCount] = useState(0)
  const activeUidRef = useRef<string | null>(null)
  const activeUidsRef = useRef<readonly string[]>([])

  const handleActiveChange = (uids: readonly string[]): void => {
    // 恰好单选才直通 uid：多选时单值语义整体让位（浮条隐藏、复制回退整图）
    const uid = uids.length === 1 ? uids[0]! : null
    activeUidRef.current = uid
    activeUidsRef.current = uids
    setActiveUid(uid)
    setActiveCount(uids.length)
  }

  /** 陈旧 uid 兜底（M4 缓期项清偿）：选中 uid 未命中渲染树时清除 ref+state，
   *  调用方回退整图复制——按钮 data-scope/title 随之回整图，不留幽灵选中；
   *  多选态（activeUid 为 null）无单值可查，不动作（引擎下一次 node_active 自会纠正计数） */
  const clearStaleIfMissing = (root: EngineNode): void => {
    const uid = activeUidRef.current
    if (uid && !findSubtreeByUid(root, uid)) {
      activeUidRef.current = null
      setActiveUid(null)
      setActiveCount(0)
    }
  }

  return { activeUid, activeUidRef, activeUidsRef, activeCount, handleActiveChange, clearStaleIfMissing }
}
