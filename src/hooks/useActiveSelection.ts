// src/hooks/useActiveSelection.ts —— 选中跟踪（M5a 拆分自 EditorView，零行为变化）：
// 引擎激活节点 uid 的 ref/state 双轨（ref 供逻辑判断走最新值，state 供按钮文案/样式渲染）
// 与复制前的陈旧 uid 清理兜底。
import { useRef, useState, type MutableRefObject } from 'react'
import { findSubtreeByUid } from '../services/mdTree'
import type { EngineNode } from '../types/engine'

export interface ActiveSelection {
  /** 当前选中节点 uid（仅供按钮文案/样式渲染） */
  activeUid: string | null
  /** 选中 uid 的 ref 镜像（逻辑判断走 ref，闭包稳定可读最新值） */
  activeUidRef: MutableRefObject<string | null>
  /** 引擎激活节点变化（MindMapCanvas onActiveChange） */
  handleActiveChange(uid: string | null): void
  /** 复制兜底：uid 已设置但未命中渲染树（如撤销删除了该节点）时清除选中态（原 doCopy 内联分支） */
  clearStaleIfMissing(root: EngineNode): void
}

export function useActiveSelection(): ActiveSelection {
  const [activeUid, setActiveUid] = useState<string | null>(null) // 仅供按钮文案/样式
  const activeUidRef = useRef<string | null>(null)

  const handleActiveChange = (uid: string | null): void => {
    activeUidRef.current = uid
    setActiveUid(uid)
  }

  /** 陈旧 uid 兜底（M4 缓期项清偿）：选中 uid 未命中渲染树时清除 ref+state，
   *  调用方回退整图复制——按钮 data-scope/title 随之回整图，不留幽灵选中 */
  const clearStaleIfMissing = (root: EngineNode): void => {
    const uid = activeUidRef.current
    if (uid && !findSubtreeByUid(root, uid)) {
      activeUidRef.current = null
      setActiveUid(null)
    }
  }

  return { activeUid, activeUidRef, handleActiveChange, clearStaleIfMissing }
}
