// src/hooks/useIconPicker.ts —— 图标管理器状态与应用（M18 想法9）
// NodeActions「图标」钮打开 IconPickerDialog；确认时非精选图标先注册进引擎
// iconList（运行时 push，nodeCreateContents 每次渲染读 opt.iconList——核验
// svg/icons.js:288-302），再 SET_NODE_ICON（nodeCommandWraps.js:18）落 data.icon；
// 无载荷 onDataChanged 触发保存链（与连线桥接同款：md 句尾 ::name 是唯一事实源）
import { useCallback, useRef, useState } from 'react'
import type { EngineNode, MindMapHandle } from '../types/engine'

/** 按引擎整树深找 uid 命中节点（getData 快照 DFS；uid 唯一，首中即返）——
 *  导出供 useTagPicker 等同构选择器复用 */
export function findByUid(root: EngineNode, uid: string | null): EngineNode | null {
  if (uid === null) return null
  if (root.data.uid === uid) return root
  for (const c of root.children ?? []) {
    const hit = findByUid(c, uid)
    if (hit !== null) return hit
  }
  return null
}

/** 选中节点文本（图标管理器标题展示） */
export function nodeTextOf(mm: MindMapHandle | null, uid: string | null): string {
  const n = mm !== null ? findByUid(mm.getData(), uid) : null
  return typeof n?.data.text === 'string' ? n.data.text : ''
}

/** 选中节点现有图标（data.icon 的 zen_ 前缀剥还原 kebab 名，纯用户图标——2026-09-06
 *  备注合并后无内部保留名；无返回空数组） */
export function nodeIconsOf(mm: MindMapHandle | null, uid: string | null): string[] {
  const node = mm !== null ? findByUid(mm.getData(), uid) : null
  return Array.isArray(node?.data.icon)
    ? node.data.icon
        .filter((i): i is string => typeof i === 'string' && i.startsWith('zen_'))
        .map((i) => i.slice(4))
    : []
}

export interface IconPickerState {
  open: boolean
  /** 当前节点文本（对话框标题）与现有图标 */
  nodeText: string
  icons: string[]
  openPicker(text: string, icons: string[]): void
  close(): void
  /** 确认应用：注册 extras → SET_NODE_ICON → 保存链 */
  apply(names: readonly string[], extras: ReadonlyArray<{ name: string; icon: string }>): void
}

export function useIconPicker(
  mmRef: React.RefObject<MindMapHandle | null>,
  uidRef: React.RefObject<string | null>,
  onDataChanged: () => void,
): IconPickerState {
  const [open, setOpen] = useState(false)
  const [nodeText, setNodeText] = useState('')
  const [icons, setIcons] = useState<string[]>([])
  // uidRef 打开瞬间的快照：确认时选中可能已变（防御，快照语义）
  const targetUidRef = useRef<string | null>(null)

  const openPicker = useCallback((text: string, current: string[]) => {
    targetUidRef.current = uidRef.current
    setNodeText(text)
    setIcons(current)
    setOpen(true)
  }, [uidRef])

  const close = useCallback(() => setOpen(false), [])

  const apply = useCallback(
    (names: readonly string[], extras: ReadonlyArray<{ name: string; icon: string }>) => {
      const mm = mmRef.current
      const uid = targetUidRef.current
      setOpen(false)
      if (mm === null || uid === null) return
      // 非精选图标运行时注册（幂等：按名去重）
      const list = mm.opt?.iconList
      if (Array.isArray(list) && list[0] !== undefined) {
        const known = new Set(list[0].list.map((i) => i.name))
        for (const e of extras) {
          if (!known.has(e.name)) list[0].list.push(e)
        }
      }
      // SET_NODE_ICON 是整组覆写：落下数组即用户所选（纯用户图标，2026-09-06 备注合并后
      // 无内部保留名掺入，「有正文」角标由镜像 data.note 承担，不受图标覆写影响）
      const icons = names.map((n) => `zen_${n}`)
      mm.execCommandIcon?.(uid, icons)
      onDataChanged() // 无载荷=必有变化：置脏 + 自动保存链
    },
    [mmRef, onDataChanged],
  )

  return { open, nodeText, icons, openPicker, close, apply }
}
