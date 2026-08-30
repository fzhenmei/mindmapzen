// 内置模板注册表（M16）：md 文件经 Vite ?raw 静态引入（随应用打包，只读）。
// 根节点文本在实例化时替换为用户输入名（createMapFromTemplate），故根标题即占位名。
import blankMd from './blank.md?raw'
import devTrackingMd from './dev-tracking.md?raw'

export interface BuiltinTemplate {
  id: string
  /** 列表显示名 */
  name: string
  /** 一句用途说明（列表项副文案） */
  desc: string
  content: string
}

/** 内置模板（顺序即列表顺序：blank 居首且为默认选中，直接输名称回车=旧行为） */
export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  { id: 'blank', name: '空白导图', desc: '一个根节点，从零开始', content: blankMd },
  {
    id: 'dev-tracking',
    name: '软件开发跟踪',
    desc: '目标 / 迭代四态 / Bug / 想法池 / 决策记录',
    content: devTrackingMd,
  },
]
