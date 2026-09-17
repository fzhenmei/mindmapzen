// src/hooks/useOutlineAutoWidth.ts —— 大纲 auto 偏好的宽判定（2026-09 画布三态，M1 抽出）：
// 容器宽 ≥ OUTLINE_WIDE_MIN 判 wide。逻辑源 FileDetail（M2 退役时切换到此 hook），
// 观察「详情区/浮层整体」而非正文剩余宽——大纲显隐不反馈进判定，避免震荡。
import { useLayoutEffect, useState, type RefObject } from 'react'

export const OUTLINE_WIDE_MIN = 900

export function useOutlineAutoWidth<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
  const [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const apply = (w: number): void => setWide(w >= OUTLINE_WIDE_MIN)
    apply(el.offsetWidth) // 布局期先读初值，免宽屏首帧闪隐
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return wide
}
