// src/services/toast.ts —— 最小 App 级轻提示（spec §7.4）：单条覆盖式，组件外可调
export interface ToastAction {
  label: string
  run(): void
}

export interface ToastItem {
  text: string
  action?: ToastAction
  /** 自动消失时长(2026-09-23 导出报障可读性):缺省走宿主默认(2s);错误类长文案
   *  (含路径/原因)传 6000 保证可读完——普通短提示不受影响 */
  durationMs?: number
}

type Listener = (t: ToastItem | null) => void

let current: ToastItem | null = null
const listeners = new Set<Listener>()

/** 空串 = 清除（测试清残留亦用） */
export function showToast(text: string, action?: ToastAction, durationMs?: number): void {
  current =
    text === ''
      ? null
      : { text, ...(action !== undefined ? { action } : {}), ...(durationMs !== undefined ? { durationMs } : {}) }
  for (const fn of listeners) fn(current)
}

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}
