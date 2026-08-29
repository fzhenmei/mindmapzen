// src/hooks/useLinkPurify.ts —— 连线净化编排（M5d Task 2，行数护栏拆出 EditorView）：
// 会话注册表（uid → 目标名列表）持有一条稳定引用，打开净化 / 保存链重建 / 序列化注入 / 复制共享。
// 每次挂载新建（父组件以 key={mdPath} 重挂载切换文档，注册表随会话重建，无持久化）。
// M5d Task 5：另持 sidecar linkAdjust（打开时注入），purify 时转交画布恢复连线弯曲。
import { useCallback, useRef, type RefObject } from 'react'
import { buildRegistry, registryToLinks, type LinkRegistry } from '../editor/linkRegistry'
import type { LinkAdjust } from '../services/linkAdjust'
import type { MindMapHandle } from '../types/engine'

export interface LinkPurify {
  /** 会话注册表（稳定引用：useSavePipeline 序列化注入、MindMapCanvas 桥接与净化共享） */
  registry: LinkRegistry
  /** 打开净化入口（EditorView onReady 调用）：转交画布 applyRegistry（等首帧渲染后建表+剥离+重建+弯曲恢复） */
  purify: (mm: MindMapHandle) => void
  /** 保存链 onSaved 入口：收割会话内手写标记（文本含 [[..]] 的节点并入注册表）后按注册表重建连线 */
  rebuildFromRegistry: () => void
  /** 注入打开时 sidecar linkAdjust（EditorView 读 sidecar 后、onReady purify 前调用） */
  setLinkAdjust: (adjust: LinkAdjust) => void
}

export function useLinkPurify(mmRef: RefObject<MindMapHandle | null>): LinkPurify {
  const regRef = useRef<LinkRegistry | null>(null)
  regRef.current ??= { byUid: new Map<string, string[]>() }
  const registry = regRef.current
  const adjustRef = useRef<LinkAdjust>({})
  const setLinkAdjust = useCallback((adjust: LinkAdjust) => {
    adjustRef.current = adjust
  }, [])
  const purify = useCallback((mm: MindMapHandle) => {
    mm.applyRegistry?.(adjustRef.current)
  }, [])
  const rebuildFromRegistry = useCallback(() => {
    const mm = mmRef.current
    const plain = mm?.getData()
    if (!mm || !plain) return
    // 净化节点文本无标记，条目原样保留；会话内手写/桥接条目并集收割（同目标去重）
    buildRegistry(plain, registry)
    mm.rebuildLinks?.(registryToLinks(plain, registry))
  }, [mmRef, registry])
  return { registry, purify, rebuildFromRegistry, setLinkAdjust }
}
