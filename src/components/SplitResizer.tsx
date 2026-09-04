import { type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '../lib/utils'

interface Props {
  /** 手柄贴面板哪一缘：right = 右缘（向右拖增宽，案头左栏）；left = 左缘（向左拖增宽，大纲） */
  side: 'left' | 'right'
  /** 拖拽起点宽（px）：pointerdown 时刻的现宽 */
  width: number
  min: number
  max: number
  /** 无障碍名（「调整侧栏宽度」/「调整大纲宽度」） */
  label: string
  /** 拖拽中每帧（已 clamp）——只更新内存态，不落盘 */
  onResize: (w: number) => void
  /** 松手提交最终宽（仅发生过移动；纯点击不提交，双击路径留给 onReset） */
  onCommit: (w: number) => void
  /** 双击恢复默认宽 */
  onReset: () => void
  className?: string
}

/** 分区拖拽手柄（2026-09 案头左栏/预览大纲共用）：Pointer Events + setPointerCapture
 *  （浏览器内拖出窗口不失联；jsdom 无实现，防御调用），move/up 兜底挂 window。
 *  拖拽中 html 挂 data-split-resizing——App.css 全局禁过渡（侧栏自带 200ms width
 *  过渡会拖坏跟手感）、锁文本选择、统一 col-resize 光标。双击 = 恢复默认宽 */
export default function SplitResizer({ side, width, min, max, label, onResize, onCommit, onReset, className }: Readonly<Props>) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const pid = e.pointerId
    const d = { startX: e.clientX, startWidth: width, last: width, moved: false }
    try {
      e.currentTarget.setPointerCapture(pid)
    } catch {
      // jsdom 无 setPointerCapture 实现；window 兜底监听仍在
    }
    document.documentElement.setAttribute('data-split-resizing', '')
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      const delta = side === 'right' ? ev.clientX - d.startX : d.startX - ev.clientX
      d.last = Math.round(Math.min(max, Math.max(min, d.startWidth + delta)))
      d.moved = true
      onResize(d.last)
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.documentElement.removeAttribute('data-split-resizing')
      if (d.moved) onCommit(d.last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="拖拽调整宽度，双击恢复默认"
      className={cn(
        'split-resizer absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-border after:opacity-0 after:transition-opacity hover:after:opacity-100',
        side === 'right' ? '-right-1' : '-left-1',
        className,
      )}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
    />
  )
}
