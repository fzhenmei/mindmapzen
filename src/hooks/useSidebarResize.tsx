import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import SplitResizer from '../components/SplitResizer'
import { useSidebar } from '../components/ui/sidebar'

/** 左栏默认宽（px）＝官方 SIDEBAR_WIDTH 16rem */
export const DEFAULT_SIDEBAR_PX = 256

/** 手柄挂载点（须在 SidebarProvider 内消费折叠态）：折叠/移动窄屏态侧栏不可见，手柄随之不渲染 */
function SidebarResizeHandle({ width, onResize, onCommit, onReset }: Readonly<{
  width: number
  onResize: (w: number) => void
  onCommit: (w: number) => void
  onReset: () => void
}>) {
  const { state, isMobile } = useSidebar()
  const { t } = useTranslation()
  if (state === 'collapsed' || isMobile) return null
  // 上限取 min(520px, 45vw)：窄窗下侧栏不吞没主区
  const max = Math.min(520, Math.round(window.innerWidth * 0.45))
  return (
    <SplitResizer
      side="right"
      width={width}
      min={200}
      max={max}
      label={t('library.resizeSidebar')}
      onResize={onResize}
      onCommit={onCommit}
      onReset={onReset}
    />
  )
}

/** 案头左栏分区拖拽（2026-09）：dragPx = 拖拽会话临时宽（每帧内存态，免逐帧写盘）；
 *  松手/双击提交 store 持久化。style 覆盖 Provider 的 --sidebar-width（官方机器
 *  gap/容器/折叠负偏移全读此变量），resizer 须渲染在 SidebarProvider 内（读折叠态） */
export function useSidebarResize(): Readonly<{ style: CSSProperties | undefined; resizer: ReactNode }> {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const [dragPx, setDragPx] = useState<number | null>(null)
  const px = dragPx ?? sidebarWidth
  const commit = (w: number | null) => {
    setDragPx(null)
    void useAppStore.getState().setSidebarWidth(w)
  }
  return {
    style: px !== null ? ({ '--sidebar-width': `${px}px` } as CSSProperties) : undefined,
    resizer: (
      <SidebarResizeHandle
        width={px ?? DEFAULT_SIDEBAR_PX}
        onResize={setDragPx}
        onCommit={(w) => commit(w)}
        onReset={() => commit(null)}
      />
    ),
  }
}
