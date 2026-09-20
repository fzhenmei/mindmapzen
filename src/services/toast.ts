// src/services/toast.ts —— 最小 App 级轻提示（spec §7.4）：单条覆盖式，组件外可调
export interface ToastAction {
  label: string
  run(): void
}

export interface ToastItem {
  text: string
  action?: ToastAction
}

type Listener = (t: ToastItem | null) => void

let current: ToastItem | null = null
const listeners = new Set<Listener>()

/** 空串 = 清除（测试清残留亦用） */
export function showToast(text: string, action?: ToastAction): void {
  current = text === '' ? null : { text, ...(action !== undefined ? { action } : {}) }
  for (const fn of listeners) fn(current)
}

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => listeners.delete(fn)
}
