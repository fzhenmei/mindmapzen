// src/hooks/useIconPicker.ts —— 图标管理器状态与应用（M18 想法9）
// NodeActions「图标」钮打开 IconPickerDialog；确认时非精选图标先注册进引擎
// iconList（运行时 push，nodeCreateContents 每次渲染读 opt.iconList——核验
// svg/icons.js:288-302），再 SET_NODE_ICON（nodeCommandWraps.js:18）落 data.icon；
// 无载荷 onDataChanged 触发保存链（与连线桥接同款：md 句尾 ::name 是唯一事实源）
import { useCallback, useRef, useState } from 'react'
import type { EngineNode, MindMapHandle } from '../types/engine'
import { execOnRenderNode } from '../services/statusOps'

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
 *  备注合并后无内部保留名；状态徽章 zen_status- 为看板保留名，排除不混入；无返回空数组） */
export function nodeIconsOf(mm: MindMapHandle | null, uid: string | null): string[] {
  const node = mm !== null ? findByUid(mm.getData(), uid) : null
  return Array.isArray(node?.data.icon)
    ? node.data.icon
        .filter(
          (i): i is string =>
            typeof i === 'string' && i.startsWith('zen_') && !i.startsWith('zen_status-'),
        )
        .map((i) => i.slice(4))
    : []
}

export interface IconPickerState {
  open: boolean
  /** 当前节点文本（对话框标题）与现有图标 */
  nodeText: string
  icons: string[]
  /** targetUid（2026-09 看板桥接）：显式指定应用目标（看板卡片非画布选中节点）；
   *  缺省取画布当前选中（uidRef）——画布浮条入口零变化 */
  openPicker(text: string, icons: string[], targetUid?: string): void
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
  // 打开瞬间的目标快照：显式 targetUid（看板卡片）或画布选中 uidRef（确认时选中可能已变，防御）
  const targetUidRef = useRef<string | null>(null)

  const openPicker = useCallback((text: string, current: string[], targetUid?: string) => {
    targetUidRef.current = targetUid ?? uidRef.current
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
      // SET_NODE_ICON 是整组覆写。徽章互保（看板模式）：覆写用户图标前保留现有状态徽章
      // （zen_status-* 原样置前，状态不受图标覆写影响），用户图标整组替换为本次所选
      // （「有正文」角标由镜像 data.note 承担，不在 icon 通道，不受覆写影响）
      const node = findByUid(mm.getData(), uid)
      const badges = Array.isArray(node?.data.icon)
        ? node.data.icon.filter(
            (i): i is string => typeof i === 'string' && i.startsWith('zen_status-'),
          )
        : []
      const icons = [...badges, ...names.map((n) => `zen_${n}`)]
      // 落命令经渲染节点寻址（2026-09 审查 Important-2）：收起分支卡片渲染树 miss 时
      // execCommandIcon 内部寻址落空即静默 no-op，且 onDataChanged 会误置脏——先展开
      // （expand 直写不进 undo，视图导航豁免）经渲染完成回调再落命令；onDataChanged
      // 只在命令真正落的分支调用
      execOnRenderNode(mm, uid, '改图标', () => {
        mm.execCommandIcon?.(uid, icons)
        onDataChanged() // 无载荷=必有变化：置脏 + 自动保存链
      })
    },
    [mmRef, onDataChanged],
  )

  return { open, nodeText, icons, openPicker, close, apply }
}
