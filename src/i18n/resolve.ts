// src/i18n/resolve.ts —— 界面语言解析(spec §一.1):auto 跟随系统;zh* 归简体,其余回退英文
import type { LanguagePref } from '../types/files'

export type UiLocale = 'zh-CN' | 'en'

/** 系统语言(WebView2 内跟随系统 UI 语言):languages 首选,回退 language */
export function systemUiLanguage(): string | undefined {
  const langs = navigator.languages ?? [navigator.language]
  return langs[0] || undefined
}

/** 三态偏好解析为实际界面语言:显式值直出;auto 按系统语言——zh* 一律归简体,
 *  其余(含取不到系统语言)回退英文(spec:不支持的语言选择英文) */
export function resolveUiLang(pref: LanguagePref, systemLanguage: string | undefined): UiLocale {
  if (pref === 'zh-CN' || pref === 'en') return pref
  return systemLanguage !== undefined && systemLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

/** 排序 locale:中文按拼音(zh-Hans-CN,现状口径),英文按字母序 */
export function sortLocale(locale: UiLocale): string {
  return locale === 'zh-CN' ? 'zh-Hans-CN' : 'en'
}
