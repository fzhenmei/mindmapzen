// src/components/ToastHost.tsx —— 轻提示宿主（App shell 常驻）：底部居中浮条，2s 自动消失
//（ToastItem.durationMs 可逐条覆盖——错误类长文案 6s,2026-09-23 可读性)
import { useEffect, useRef, useState } from 'react'
import { subscribeToast, type ToastItem } from '../services/toast'

const AUTO_HIDE_MS = 2000

export default function ToastHost() {
  const [item, setItem] = useState<ToastItem | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(
    () =>
      subscribeToast((t) => {
        if (timer.current !== null) window.clearTimeout(timer.current)
        setItem(t)
        // 非有限时长不排自动消失(2026-09-23 导出等待提示):setTimeout(fn, Infinity)
        // 会被宿主钳到 0 立即消失,必须 isFinite 守卫;未传 durationMs 时 ?? 默认值恒有限,
        // 普通 toast 2s 行为不变
        if (t !== null && Number.isFinite(t.durationMs ?? AUTO_HIDE_MS)) {
          timer.current = window.setTimeout(() => setItem(null), t.durationMs ?? AUTO_HIDE_MS)
        }
      }),
    [],
  )
  if (item === null) return null
  return (
    <div
      data-testid="toast"
      className="fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-card px-4 py-2 text-sm shadow-lg"
    >
      <span>{item.text}</span>
      {item.action !== undefined && (
        <button
          type="button"
          data-testid="toast-action"
          className="text-primary underline-offset-2 hover:underline"
          onClick={() => {
            const run = item.action?.run
            setItem(null)
            run?.()
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  )
}
