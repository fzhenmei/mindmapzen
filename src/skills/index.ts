// src/skills/index.ts —— skill 注册表(spec §4.1):新增 skill = 加目录 + 在此注册,
// 其余(UI/工具/prompt/引导)全自动。启用口径:凭据槽非空 = 启用。
import weread from './weread/manifest'
import type { SkillManifest } from './types'
import type { SkillsConfig } from '../types/files'

export const SKILLS: readonly SkillManifest[] = [weread]

/** 凭据非空的 skill 即启用(spec §4.5) */
export function getEnabledSkills(config: SkillsConfig): SkillManifest[] {
  return SKILLS.filter((m) => (config[m.id]?.apiKey ?? '') !== '')
}

/** 工具域消费形态:id → manifest + 已配凭据(executeSkillTool 的 resolve 面) */
export function enabledSkillEntries(
  config: SkillsConfig,
): ReadonlyMap<string, { manifest: SkillManifest; apiKey: string }> {
  const m = new Map<string, { manifest: SkillManifest; apiKey: string }>()
  for (const s of getEnabledSkills(config)) m.set(s.id, { manifest: s, apiKey: config[s.id]?.apiKey ?? '' })
  return m
}
