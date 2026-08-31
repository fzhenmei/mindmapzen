// 内置模板注册表（M16）：md 文件经 Vite ?raw 静态引入（随应用打包，只读）。
// 根节点文本在实例化时替换为用户输入名（createMapFromTemplate），故根标题即占位名。
// v2.1：dev-tracking 退役，ai-collab 接任——用户定稿的人机分工版（想法五态追踪，
// Bug/版本不入图；详见模板根备注与 manual-checklist）
// v2.2：DDD 战略层入图——新增「领域地图」（有界上下文/统一语言/契约），
// 「进行中」按上下文分组（未归类兜底），契约冻结后跨上下文开 worktree 并行
import blankMd from './blank.md?raw'
import aiCollabMd from './ai-collab.md?raw'

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
    id: 'ai-collab',
    name: 'AI 协作开发',
    desc: '目标 / 领域地图 / 想法五态 · 人机分工',
    content: aiCollabMd,
  },
]
