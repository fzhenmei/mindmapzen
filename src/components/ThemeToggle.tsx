import { useAppStore } from '../store/appStore'
import type { ThemePref } from '../types/files'

// 循环切换：auto → light → dark → auto
const ORDER = ['auto', 'light', 'dark'] as const
const LABEL: Record<ThemePref, string> = { auto: '主题：跟随系统', light: '主题：纸（亮）', dark: '主题：夜墨（暗）' }

/** 主题三态切换（testid btn-theme；文字占位，Task 4 换图标，testid/语义不变） */
export default function ThemeToggle() {
  const themePref = useAppStore((s) => s.themePref)
  return (
    <button
      type="button"
      data-testid="btn-theme"
      className="theme-toggle"
      title={`${LABEL[themePref]}（点击切换）`}
      aria-label={LABEL[themePref]}
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(themePref) + 1) % ORDER.length]
        void useAppStore.getState().setThemePref(next)
      }}
    >
      {themePref === 'auto' ? '半' : themePref === 'light' ? '亮' : '暗'}
    </button>
  )
}
