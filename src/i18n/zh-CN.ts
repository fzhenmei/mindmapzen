// src/i18n/zh-CN.ts —— 中文词典聚合(模块文件见 locales/zh-CN/;en 侧结构强制同构)
import common from './locales/zh-CN/common'
import settings from './locales/zh-CN/settings'
import errors from './locales/zh-CN/errors'
import library from './locales/zh-CN/library'

const zh = { common, settings, errors, library }
export default zh
/** 词典结构契约:en 聚合以此类型强制同构(漏译/多译编译报错) */
export type Dict = typeof zh
