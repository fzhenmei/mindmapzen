import { useAppStore } from '../store/appStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { IconTheme } from './icons'
import { nextVisibleTheme } from '../services/theme'
import type { ThemePref } from '../types/files'

const LABEL: Record<ThemePref, string> = { auto: '主题：跟随系统', light: '主题：晨松（亮）', dark: '主题：夜航（暗）' }

/** 命令栏图标钮（M12b 案头命令栏）：与 LibraryView ICON_BTN 同规（ui/button icon 尺寸） */
const ICON_BTN =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 主题三态切换（testid btn-theme；M4 起换 IconTheme 图标，testid/aria-label 不变）。
 *  单击目标由 nextVisibleTheme 决定（验收修复 1）：跳过与当前解析结果相同的候选，
 *  保证一次点击必有一次可见主题变化。M12b Task 5 切 ui/tooltip（title 退役防双提示） */
export default function ThemeToggle() {
  const themePref = useAppStore((s) => s.themePref)
  return (
    <TooltipProvider>
      <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="btn-theme"
          className={ICON_BTN}
          aria-label={LABEL[themePref]}
          onClick={() => {
            void useAppStore.getState().setThemePref(nextVisibleTheme(themePref))
          }}
        >
          <IconTheme />
        </button>
      </TooltipTrigger>
        <TooltipContent>{`${LABEL[themePref]}（点击切换）`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
