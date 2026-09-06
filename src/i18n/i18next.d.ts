// src/i18n/i18next.d.ts —— t() key 类型收紧:资源结构即键空间
import type zhCN from './zh-CN'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof zhCN
    }
  }
}
