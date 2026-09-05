import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSidebar } from './ui/sidebar'

/** 侧栏底栏图标钮共用样式（2026-09）：设置/隐藏成对居于「新建目录」行右侧，侧栏令牌
 *  ghost（官方 SidebarMenuAction 同款交互色），size-8 与行高对齐 */
export const SIDEBAR_ICON_BTN =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring'

/** 侧栏收放钮对（2026-09 案头重定位）：原页首 SidebarTrigger 悬在主区页首，位置与
 *  左面板脱节、功能费解。现改为随状态换位：
 *  - 面板可见 → HideSidebarAction 收进侧栏底栏「新建目录」行右端（设置钮右侧），
 *    钮在面板内、所指即自身；
 *  - 面板隐藏 → ShowSidebarTab 在视口左缘纵向居中浮一枚与 SidebarInset 同材质的
 *    小签，面板滑出后留在边缘作唤回入口。
 *  两者均消费 useSidebar 的 toggleSidebar（Ctrl+B 快捷键与移动 Sheet 语义由 Provider
 *  统一承担），故须渲染在 SidebarProvider 内。offcanvas 折叠侧栏滑出屏外但不卸载
 *  ——两钮会同帧并存于 DOM，testid 不同（dir-panel-toggle / dir-panel-show）避免撞查询 */

/** 面板可见态：底栏行内动作钮（PanelLeftClose 示意「收起本面板」）。
 *  行内流式按钮（非官方绝对定位 SidebarMenuAction 槽）——底栏是「新建目录 + 设置 +
 *  收起」弹性行，两枚图标钮成对右置，槽位式的 pr-8 预留只适配单钮 */
export function HideSidebarAction() {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      type="button"
      data-testid="dir-panel-toggle"
      aria-label="隐藏目录面板"
      title="隐藏目录面板（Ctrl+B）"
      onClick={toggleSidebar}
      className={SIDEBAR_ICON_BTN}
    >
      <PanelLeftClose className="size-4" />
    </button>
  )
}

/** 面板隐藏态：视口左缘唤回签（fixed 逃逸 flex 布局；top-8 避开 h-8 标题栏，
 *  top/bottom + my-auto + h-12 实现纵向居中；祖先无 transform，fixed 即视口参照） */
export function ShowSidebarTab() {
  const { state, isMobile, toggleSidebar } = useSidebar()
  if (state !== 'collapsed' || isMobile) return null
  return (
    <button
      type="button"
      data-testid="dir-panel-show"
      aria-label="显示目录面板"
      title="显示目录面板（Ctrl+B）"
      onClick={toggleSidebar}
      className="fixed top-8 bottom-0 left-0 z-30 my-auto flex h-12 w-6 items-center justify-center rounded-r-lg border border-l-0 border-sidebar-border bg-background shadow-md outline-hidden transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PanelLeftOpen className="size-3.5 text-muted-foreground" />
    </button>
  )
}
