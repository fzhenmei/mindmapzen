// src/services/basketSync.ts —— 跨窗同步（spec §5.5）：捕获小窗写盘成功后 emit，
// 主窗按状态决策（reload/notify/ignore）。纯函数在 M2 Task 9 扩充
export const BASKET_UPDATED_EVENT = 'basket-updated'

export type BasketSyncAction = 'reload' | 'notify' | 'ignore'

/** 主窗对「篮子已在小窗写盘」的决策（spec §5.5）：当前开的就是篮子图——干净则静默
 *  重载（reopenEditor 强制重挂从磁盘重读，与冲突裁决同机制）；脏则 toast 提示（保存链
 *  的 mtime 冲突对话框仍兜底）。其余情况忽略（案头列表按需 rescan） */
export function planBasketReload(
  s: { route: string; currentMdPath: string | null; dirty: boolean },
  ev: { mapPath: string },
): BasketSyncAction {
  if (s.route !== 'editor' || s.currentMdPath !== ev.mapPath) return 'ignore'
  return s.dirty ? 'notify' : 'reload'
}
