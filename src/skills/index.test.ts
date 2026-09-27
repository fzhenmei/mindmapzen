// src/skills/index.test.ts —— 注册表完整性(spec §7):防 manifest 漏填/上游文档
// 覆盖后忘同步 skillVersion(frontmatter version 与 manifest 值必须一致)。
import { describe, expect, it } from 'vitest'
import { SKILLS, enabledSkillEntries, getEnabledSkills } from './index'

describe('skill 注册表', () => {
  it('每项 manifest 字段完整', () => {
    for (const m of SKILLS) {
      expect(m.id).not.toBe('')
      expect(m.name).not.toBe('')
      expect(m.description).not.toBe('')
      expect(m.keyHelpUrl).toMatch(/^https:\/\//)
      expect(m.examples.length).toBeGreaterThanOrEqual(1)
      expect(m.gatewayUrl).toMatch(/^https:\/\//)
      expect(m.skillVersion).toMatch(/^\d+\.\d+\.\d+$/)
      expect(m.instructions.length).toBeGreaterThan(1000)
      expect(Object.keys(m.docs).length).toBeGreaterThanOrEqual(8)
      for (const doc of Object.values(m.docs)) expect(doc.length).toBeGreaterThan(500)
    }
  })
  it('SKILL.md frontmatter version 与 manifest.skillVersion 一致', () => {
    for (const m of SKILLS) {
      const v = (m.instructions.match(/^version:\s*(\S+)/m) ?? [])[1]
      expect(v).toBe(m.skillVersion)
    }
  })
  it('getEnabledSkills:凭据空 = 不启用;非空 = 启用', () => {
    expect(getEnabledSkills({})).toEqual([])
    expect(getEnabledSkills({ weread: { apiKey: '' } })).toEqual([])
    expect(getEnabledSkills({ weread: { apiKey: 'wrk-x' } }).map((m) => m.id)).toEqual(['weread'])
  })
  it('enabledSkillEntries:含凭据', () => {
    const m = enabledSkillEntries({ weread: { apiKey: 'wrk-x' } })
    expect(m.get('weread')?.apiKey).toBe('wrk-x')
    expect(m.get('weread')?.manifest.id).toBe('weread')
  })
})
