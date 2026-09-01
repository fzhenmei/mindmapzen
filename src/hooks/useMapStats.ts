// src/hooks/useMapStats.ts —— 题签统计行数据源（2026-09 版本信息批）：
// 节点总数（onDataChange 携带整树快照时重数；展开命令的无载荷上报不改节点总数）
// 与最后成功落盘时刻（markSaved 由保存链成功回调触发）。
// 无参纯状态 hook（管线透传由 EditorView 组合——pipeline 的 onSaved 也要回调
// markSaved，hook 若反向持有管线引用会成环）。
import { useState } from 'react'
import type { EngineNode } from '../types/engine'

/** 递归数节点（含根） */
function countTree(node: EngineNode): number {
  return 1 + (node.children ?? []).reduce((n, c) => n + countTree(c), 0)
}

export interface MapStats {
  nodeCount: number
  /** 最后一次落盘时刻（ms）：打开初值取文件 mtime，会话内保存链成功后刷新；
   *  null = 拿不到文件时刻（防御，正常不出现） */
  savedAt: number | null
  /** 引擎数据变化（携带快照时顺带重数节点；无载荷调用只忽略计数） */
  onDataChange(data?: EngineNode): void
  /** 打开文档初值（文件 mtime）：「保存于」自打开即有意义——干净图显示「未保存」
   *  会被误读为有未落盘修改（新建即落盘，盘上明明有文件） */
  initSavedAt(ms: number): void
  /** 保存链成功回调（写 md+sidecar 落盘后触发） */
  markSaved(): void
}

export function useMapStats(): MapStats {
  const [nodeCount, setNodeCount] = useState(0)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  return {
    nodeCount,
    savedAt,
    onDataChange: (data?: EngineNode) => {
      if (data !== undefined) setNodeCount(countTree(data))
    },
    initSavedAt: (ms: number) => setSavedAt(ms),
    markSaved: () => setSavedAt(Date.now()),
  }
}
