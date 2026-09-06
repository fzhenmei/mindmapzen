// src/services/backendError.ts —— Rust 命令错误本地化(spec §一.3):稳定码映射,未识别原样
import { i18n } from '../i18n'

/** 仅映射用户可感错误;INVALID_COLOR/DWM_* 只进 console.warn(技术日志),不映射 */
export function describeBackendError(raw: string): string {
  if (raw === 'GIT_TIMEOUT') return i18n.t('errors.gitTimeout')
  return raw
}
