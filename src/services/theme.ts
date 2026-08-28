// src/services/theme.ts —— 应用主题三态（auto/light/dark）解析与应用（tokens.css 消费 data-theme）
import type { ThemePref } from '../types/files'

export type ResolvedTheme = 'light' | 'dark'

const QUERY = '(prefers-color-scheme: dark)'
const ORDER = ['auto', 'light', 'dark'] as const

/** auto 跟随系统偏好（prefers-color-scheme），显式值直出 */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

/** 写入 :root[data-theme]，tokens.css 据此切换砚/纸两套令牌 */
export function applyDocumentTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}

/** 单击切换的目标偏好（验收修复 1）：按 auto→light→dark 循环序取「与当前解析结果不同」的
 *  首个候选——跳过视觉上无变化的档位（如系统亮色时 auto→light 首跳不可感知，直达 dark），
 *  保证单击必有一次可见主题变化；全部相同不可能发生（候选集非空且含对侧显式值），仍兜底取首候选 */
export function nextVisibleTheme(cur: ThemePref): ThemePref {
  const resolved = resolveTheme(cur)
  const candidates = ORDER.filter((o) => o !== cur)
  return candidates.find((c) => resolveTheme(c) !== resolved) ?? candidates[0]
}

/** 监听系统主题变化（仅 auto 模式生效，由调用方判断）；返回解绑函数 */
export function watchSystemTheme(cb: (r: ResolvedTheme) => void): () => void {
  const mq = window.matchMedia(QUERY)
  const onChange = () => cb(mq.matches ? 'dark' : 'light')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
