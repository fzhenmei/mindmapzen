// src/i18n/index.ts —— i18next 单例装配(spec §一.2):资源内联 TS 模块,同步 init,无后端
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './zh-CN'
import en from './en'
import type { UiLocale } from './resolve'

/** 初始化(幂等):main.tsx 渲染前以系统语言预热;test setup 以 zh-CN 预热 */
export function initI18n(locale: UiLocale): void {
  if (i18next.isInitialized) return
  void i18next.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    resources: { 'zh-CN': { translation: zhCN }, en: { translation: en } },
    interpolation: { escapeValue: false }, // React 已转义;服务层消息走文本节点同样安全
    react: { useSuspense: false },
  })
  document.documentElement.lang = locale
}

/** 语言切换:实例切换(react-i18next 订阅自动重渲染)+ html lang 同步 */
export function changeUiLanguage(locale: UiLocale): void {
  void i18next.changeLanguage(locale)
  document.documentElement.lang = locale
}

/** 组件外翻译口(services/store 直接调用;组件内用 useTranslation) */
export { i18next as i18n }
