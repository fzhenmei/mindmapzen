// src/views/editorSkillWire.ts —— 编辑器侧 AI 面板的 skill 域接线(2026-09 skill 网关,spec §4):
// prompt 清单/工具路由/schema 三处取值口径集中于此(自 EditorView 抽出以守 guard:lines 护栏)。
// 口径分工:prompt/路由走 getState() 即时取——回合进行中凭据变更即时生效,避免陈旧引用;
// schema 用渲染期订阅值即可——未配 key 的 skill 连工具都不注册(spec §4.5)
import { enabledSkillEntries, getEnabledSkills } from '../skills'
import type { SkillManifest } from '../skills/types'
import { executeSkillTool, getSkillGateway, SKILL_TOOL_NAMES, skillToolSchemas } from '../services/ai/toolsSkill'
import type { ToolCallResult } from '../services/ai/tools'
import type { SkillIntroItem } from '../components/ChatPanel'
import { useAppStore } from '../store/appStore'
import type { SkillsConfig } from '../types/files'

/** prompt/工具路由共用的启用清单:凭据非空即启用,getState() 即时快照 */
export function enabledSkillsNow(): SkillManifest[] {
  return getEnabledSkills(useAppStore.getState().skillsConfig)
}

/** skill 工具 schema(工具清单面):传渲染期订阅值,未配 key 不注册 */
export function skillToolSchemasOf(config: SkillsConfig): unknown[] {
  return skillToolSchemas(getEnabledSkills(config))
}

/** 空态 skill 引导(方案 D):启用清单的展示子集,EditorView 注入 ChatPanel 空态常驻渲染——
 *  引导随空态派生,不依赖一次性 notice(dev StrictMode 双挂载/切图 reset 均不丢) */
export function skillIntroOf(config: SkillsConfig): SkillIntroItem[] {
  return getEnabledSkills(config).map((m) => ({ name: m.name, examples: m.examples }))
}

/** 工具路由:命中 skill 域走 executeSkillTool(网关+凭据即时取),未命中返回 null 交回通用工具域 */
export function executeSkillRoute(name: string, args: unknown): Promise<ToolCallResult> | null {
  if (!SKILL_TOOL_NAMES.has(name)) return null
  return executeSkillTool(name, args, getSkillGateway(), enabledSkillEntries(useAppStore.getState().skillsConfig))
}
