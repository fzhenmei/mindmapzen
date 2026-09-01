// src/services/theme.ts —— 应用主题三态（auto/light/dark）解析与应用（tokens.css 消费 data-theme）
import { invoke } from '@tauri-apps/api/core'
import type { ThemePref } from '../types/files'

export type ResolvedTheme = 'light' | 'dark'

const QUERY = '(prefers-color-scheme: dark)'
const ORDER = ['auto', 'light', 'dark'] as const

/** auto 跟随系统偏好（prefers-color-scheme），显式值直出 */
export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

/** 窗口边框主题染色（v2.5）：自定义标题栏（decorations: false）后系统 caption 不复
 *  存在，DWM 染色仅剩边框意义——Win11 无边框窗口仍有 DWM 画的细边框线，不染则跟随
 *  系统强调色（深蓝）与应用主题割裂。颜色读 computed 变量——theme.css 是唯一真相源；
 *  非 Tauri 环境（vitest jsdom / 纯浏览器 dev / E2E web 模式）守卫跳过；invoke 失败
 *  仅 warn 静默（Win10 无 BORDER_COLOR 属性，属预期视觉退化，不阻断主题切换） */
function syncWindowBorderColor(): void {
  if (!('__TAURI_INTERNALS__' in window)) return
  const dark = document.documentElement.dataset.theme === 'dark'
  const style = getComputedStyle(document.documentElement)
  const caption = style.getPropertyValue('--background').trim() // 无边框下无 caption，占位传背景色
  const border = style.getPropertyValue('--border').trim()
  void invoke('set_titlebar_colors', { caption, border, dark }).catch((e) =>
    console.warn('窗口边框染色失败', e),
  )
}

/** 写入 :root[data-theme]，tokens.css 据此切换砚/纸两套令牌 */
export function applyDocumentTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
  syncWindowBorderColor()
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
