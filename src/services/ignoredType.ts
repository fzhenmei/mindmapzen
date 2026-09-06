// src/services/ignoredType.ts —— 忽略块类型本地名(spec §3.5 横幅/确认/导入预览共用;未知兜底)
import { i18n } from '../i18n'

/** 中文键(xmind 数据原值)与英文键同名,词典见 errors.ignoredType */
export function describeIgnoredType(type: string): string {
  const key = `errors.ignoredType.${type}`
  // exists 探键 + other 兜底;defaultValue '' 仅满足 i18next v26 动态键的严格类型(exists 守卫下不触达)
  return i18n.exists(key) ? i18n.t(key, { defaultValue: '' }) : i18n.t('errors.ignoredType.other')
}
