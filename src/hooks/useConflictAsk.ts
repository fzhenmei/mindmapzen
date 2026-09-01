// src/hooks/useConflictAsk.ts —— 冲突裁决（外部变更防护，v2.5.1）：
// 保存链写盘前发现磁盘内容 ≠ 基线（另一实例/外部编辑器改盘）时，挂起保存链弹
// 三态对话框等用户裁决；决策即 resolve 保存链。reload 分支丢弃内存编辑并递增
// 重挂序号（App 层 key 变化）从磁盘重载。卸载兜底：未决裁决按 cancel 收口，防保存链永挂。
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useAppStore } from '../store/appStore'

export type ConflictChoice = 'overwrite' | 'reload' | 'cancel'

export interface ConflictAsk {
  /** 冲突对话框开态（EditorDialogs 的 conflict 槽） */
  open: boolean
  /** 保存链入口（useSavePipeline 的 onExternalConflict）：挂起等待三态决策 */
  ask(): Promise<ConflictChoice>
  /** 对话框选择回调（决策透传保存链；reload 另行触发重载） */
  onChoice(c: ConflictChoice): void
}

export function useConflictAsk(dirtyRef: MutableRefObject<boolean>, clearDirty: () => void): ConflictAsk {
  const [open, setOpen] = useState(false)
  const resolverRef = useRef<((c: ConflictChoice) => void) | null>(null)

  // 卸载兜底：尚挂起的裁决按 cancel 收口——否则保存链的 await 永不决议（切换文档/
  // 关窗瞬间遇到冲突的极端窗口），串行链卡死后再无保存轮
  useEffect(() => {
    return () => {
      resolverRef.current?.('cancel')
    }
  }, [])

  const ask = (): Promise<ConflictChoice> =>
    new Promise((resolve) => {
      resolverRef.current = resolve
      setOpen(true)
    })

  const onChoice = (c: ConflictChoice): void => {
    setOpen(false)
    resolverRef.current?.(c)
    resolverRef.current = null
    if (c === 'reload') {
      // 以磁盘版为准：丢弃内存编辑（防卸载冲刷再写盘/守卫再拦），重挂序号递增 → 从磁盘重载
      dirtyRef.current = false
      clearDirty()
      useAppStore.getState().reopenEditor()
    }
  }

  return { open, ask, onChoice }
}
