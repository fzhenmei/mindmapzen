// src/services/theme.ts —— 应用主题三态（auto/light/dark）解析与应用（tokens.css 消费 data-theme）
import type { ThemePref } from '../types/files'

export type ResolvedTheme = 'light' | 'dark'

const QUERY = '(prefers-color-scheme: dark)'

/** auto 跟随系统偏好（prefers-color-scheme），显式值直出 */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

/** 写入 :root[data-theme]，tokens.css 据此切换砚/纸两套令牌 */
export function applyDocumentTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}

/** 监听系统主题变化（仅 auto 模式生效，由调用方判断）；返回解绑函数 */
export function watchSystemTheme(cb: (r: ResolvedTheme) => void): () => void {
  const mq = window.matchMedia(QUERY)
  const onChange = () => cb(mq.matches ? 'dark' : 'light')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
