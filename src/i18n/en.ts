// src/i18n/en.ts —— 英文词典:Dict 类型强制与 zh-CN 同构(增域时两文件同步加 import/聚合)
import type { Dict } from './zh-CN'
import common from './locales/en/common'
import settings from './locales/en/settings'
import errors from './locales/en/errors'
import library from './locales/en/library'
import editor from './locales/en/editor'

const en: Dict = { common, settings, errors, library, editor }
export default en
/** 契约类型再出口:en 侧子模块(locales/en/*)统一从此处取 Dict,免深层路径耦合 */
export type { Dict }
