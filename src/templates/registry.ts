// src/templates/registry.ts —— 内置模板注册表（M16）：md 经 Vite ?raw 静态引入。
// v2.2 起 ai-collab 为人机分工版；2026-09 i18n：列表名/描述/内容按当前界面语言取
// （创建后即用户文件，不随语言切换变化）；根节点文本实例化时替换为用户输入名。
import blankMd from './blank.md?raw'
import aiCollabMd from './ai-collab.md?raw'
import aiCollabEnMd from './ai-collab.en.md?raw'
import { i18n } from '../i18n'

export interface BuiltinTemplate {
  id: string
  /** 列表显示名 */
  name: string
  /** 一句用途说明（列表项副文案） */
  desc: string
  content: string
}

/** 内置模板（顺序即列表顺序：blank 居首且为默认选中，直接输名称回车=旧行为） */
export function builtinTemplates(): readonly BuiltinTemplate[] {
  const en = i18n.language === 'en'
  return [
    {
      id: 'blank',
      name: en ? 'Blank map' : '空白导图',
      desc: en ? 'One root node, start from scratch' : '一个根节点，从零开始',
      content: blankMd,
    },
    {
      id: 'ai-collab',
      name: en ? 'AI-collab development' : 'AI 协作开发',
      desc: en ? 'Goals / Domain map / Idea states · human-AI split' : '目标 / 领域地图 / 想法五态 · 人机分工',
      content: en ? aiCollabEnMd : aiCollabMd,
    },
  ]
}
