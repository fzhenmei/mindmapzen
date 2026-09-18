import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { IconTheme } from './icons'
import { nextVisibleTheme } from '../services/theme'
import { cn } from '../lib/utils'

/** 主题三态切换（testid btn-theme；M4 起换 IconTheme 图标，testid/aria-label 不变）。
 *  单击目标由 nextVisibleTheme 决定（验收修复 1）：跳过与当前解析结果相同的候选，
 *  保证一次点击必有一次可见主题变化。M14 Task 5 钮体换 ui Button(ghost,icon-sm)
 *  + ui/tooltip（title 退役防双提示，官方默认内距）。标签文案走词典（三态键与
 *  ThemePref 同名，语言切换即时反映） */
export default function ThemeToggle() {
  const themePref = useAppStore((s) => s.themePref)
  const { t } = useTranslation()
  const label = t(`settings.theme.${themePref}`)
  return (
    <TooltipProvider>
      <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="btn-theme"
          aria-label={label}
          onClick={() => {
            void useAppStore.getState().setThemePref(nextVisibleTheme(themePref))
          }}
        >
          <IconTheme />
        </Button>
      </TooltipTrigger>
        <TooltipContent>{label + t('settings.theme.clickHint')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** 右下角主题钮定位容器（2026-09 三态统一）：开屏/案头/纸面同款挂法，锚点为最近
 *  relative 祖先（开屏 .library / 案头 SidebarInset / 纸面 .editor）；theme-fab
 *  类名保留为视觉冒烟钩子。抽出前三处各写一份相同 div（EditorCaption 原创）。
 *  className 透传（2026-09 UI 评审 P1）：纸面态由 EditorCaption 传窄容器上移变体
 *  （@max-[1150px]:bottom-16，容器为 .editor 的 @container）——窄窗命令栏固定
 *  ~778px 居中，角标同线必被遮住；开屏/案头无命令栏不传、维持原位。
 *  z-10 常驻件层（2026-09 修复回归）：原 z-[5] 被 Markdown/看板 z-[9] 全屏不透明
 *  视图盖死——主题钮属常驻件（同砚栏 z-10 层），须浮于视图之上；窄窗与砚栏的水
 *  平重叠由上述 bottom-16 上移变体规避（>1150px 时角标与居中命令栏不相交），
 *  案头 popover z-20 / Radix z-50 仍在其上，层级语义不变 */
export function ThemeFab({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn('theme-fab absolute bottom-3 right-4 z-10', className)}>
      <ThemeToggle />
    </div>
  )
}
