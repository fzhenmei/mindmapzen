import { useAppStore } from '../store/appStore'
import ZenTooltip from './ZenTooltip'
import { IconTheme } from './icons'
import { nextVisibleTheme } from '../services/theme'
import type { ThemePref } from '../types/files'

const LABEL: Record<ThemePref, string> = { auto: '主题：跟随系统', light: '主题：纸（亮）', dark: '主题：夜墨（暗）' }

/** 主题三态切换（testid btn-theme；M4 起换 IconTheme 图标，testid/aria-label 不变）。
 *  单击目标由 nextVisibleTheme 决定（验收修复 1）：跳过与当前解析结果相同的候选，
 *  保证一次点击必有一次可见主题变化。M5c 接 ZenTooltip（title 退役防双提示） */
export default function ThemeToggle() {
  const themePref = useAppStore((s) => s.themePref)
  return (
    <ZenTooltip label={`${LABEL[themePref]}（点击切换）`}>
      <button
        type="button"
        data-testid="btn-theme"
        className="theme-toggle"
        aria-label={LABEL[themePref]}
        onClick={() => {
          void useAppStore.getState().setThemePref(nextVisibleTheme(themePref))
        }}
      >
        <IconTheme />
      </button>
    </ZenTooltip>
  )
}
