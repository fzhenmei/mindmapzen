// src/hooks/useTagPicker.ts —— 标签选择器状态与应用（与 useIconPicker 同构）
// NodeActions「标签」钮打开 TagPickerDialog；确认时 SET_NODE_TAG（nodeCommandWraps.js:37）
// 落 data.tag（引擎原生彩色小标签渲染，颜色按文本稳定生成——同名同色）；无载荷
// onDataChanged 触发保存链（与图标/连线桥接同款：md 句尾 #tag 标记是唯一事实源）
import { useCallback, useRef, useState } from 'react'
import type { EngineNode, MindMapHandle } from '../types/engine'
import { collectTags } from '../services/mdTree'
import { execOnRenderNode } from '../services/statusOps'
import { findByUid } from './useIconPicker'

/** 选中节点现有标签（data.tag 两形态宽容收集；无返回空数组） */
export function nodeTagsOf(mm: MindMapHandle | null, uid: string | null): string[] {
  const node = mm !== null ? findByUid(mm.getData(), uid) : null
  return collectTags(node?.data.tag)
}

/** 全图已用标签（整树 DFS，首现序去重；空图/无标签返回空数组） */
export function usedTagsOf(mm: MindMapHandle | null): string[] {
  if (mm === null) return []
  const seen = new Set<string>()
  const walk = (node: EngineNode): void => {
    for (const t of collectTags(node.data.tag)) if (!seen.has(t)) seen.add(t)
    for (const c of node.children ?? []) walk(c)
  }
  walk(mm.getData())
  return [...seen]
}

export interface TagPickerState {
  open: boolean
  /** 当前节点文本（对话框标题）与现有标签/全图已用（打开时快照） */
  nodeText: string
  tags: string[]
  used: string[]
  /** targetUid（2026-09 看板桥接）：显式指定应用目标（看板卡片非画布选中节点）；
   *  缺省取画布当前选中（uidRef）——画布浮条入口零变化 */
  openPicker(text: string, current: string[], used: string[], targetUid?: string): void
  close(): void
  /** 确认应用：SET_NODE_TAG 整组覆写 → 保存链 */
  apply(tags: readonly string[]): void
}

export function useTagPicker(
  mmRef: React.RefObject<MindMapHandle | null>,
  uidRef: React.RefObject<string | null>,
  onDataChanged: () => void,
): TagPickerState {
  const [open, setOpen] = useState(false)
  const [nodeText, setNodeText] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [used, setUsed] = useState<string[]>([])
  // 打开瞬间的目标快照：显式 targetUid（看板卡片）或画布选中 uidRef（确认时选中可能已变，防御）
  const targetUidRef = useRef<string | null>(null)

  const openPicker = useCallback((text: string, current: string[], usedNow: string[], targetUid?: string) => {
    targetUidRef.current = targetUid ?? uidRef.current
    setNodeText(text)
    setTags(current)
    setUsed(usedNow)
    setOpen(true)
  }, [uidRef])

  const close = useCallback(() => setOpen(false), [])

  const apply = useCallback(
    (next: readonly string[]) => {
      const mm = mmRef.current
      const uid = targetUidRef.current
      setOpen(false)
      if (mm === null || uid === null) return
      // SET_NODE_TAG 整组覆写：空数组即移除全部标签。落命令经渲染节点寻址
      // （2026-09 审查 Important-2）：收起分支卡片渲染树 miss 时 execCommandTag 内部
      // 寻址落空即静默 no-op，且 onDataChanged 会误置脏——先展开再于渲染完成回调落命令
      execOnRenderNode(mm, uid, '改标签', () => {
        mm.execCommandTag?.(uid, [...next])
        onDataChanged() // 无载荷=必有变化：置脏 + 自动保存链
      })
    },
    [mmRef, onDataChanged],
  )

  return { open, nodeText, tags, used, openPicker, close, apply }
}
