import { useAppStore } from '../store/appStore'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { IconTheme } from './icons'
import { nextVisibleTheme } from '../services/theme'
import type { ThemePref } from '../types/files'

const LABEL: Record<ThemePref, string> = { auto: '主题：跟随系统', light: '主题：晨松（亮）', dark: '主题：夜航（暗）' }

/** 主题三态切换（testid btn-theme；M4 起换 IconTheme 图标，testid/aria-label 不变）。
 *  单击目标由 nextVisibleTheme 决定（验收修复 1）：跳过与当前解析结果相同的候选，
 *  保证一次点击必有一次可见主题变化。M14 Task 5 钮体换 ui Button(ghost,icon-sm)
 *  + ui/tooltip（title 退役防双提示，官方默认内距） */
export default function ThemeToggle() {
  const themePref = useAppStore((s) => s.themePref)
  return (
    <TooltipProvider>
      <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid="btn-theme"
          aria-label={LABEL[themePref]}
          onClick={() => {
            void useAppStore.getState().setThemePref(nextVisibleTheme(themePref))
          }}
        >
          <IconTheme />
        </Button>
      </TooltipTrigger>
        <TooltipContent>{`${LABEL[themePref]}（点击切换）`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
