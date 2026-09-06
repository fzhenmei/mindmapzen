import { describe, expect, test } from 'vitest'
import { builtinTemplates } from './registry'
import { i18n } from '../i18n'
import { CURATED_ICONS } from '../editor/zenIcons'
import { extractIconMarkers } from '../services/iconMarkers'

// 模板内容引用的图标标记必须落在精选集内——v2.1 实案：模板说明写了 ::flask 但
// 精选集没有（fire→flame 修正时未补），图标落空渲染为空。本测试锁住这层脱节。
// 2026-09 i18n：模板内容随界面语言取（zh/en 两版），故两种语言各锁一遍
describe('内置模板与图标集一致性', () => {
  test('模板 md 中的 ::name 标记全部存在于 CURATED_ICONS', async () => {
    try {
      for (const lang of ['zh-CN', 'en'] as const) {
        await i18n.changeLanguage(lang)
        for (const t of builtinTemplates()) {
          const used = extractIconMarkers(t.content)
          const missing = used.filter((n) => CURATED_ICONS[n] === undefined)
          expect(missing, `模板 ${t.name} 引用了精选集外的图标：${missing.join(', ')}`).toEqual([])
        }
      }
    } finally {
      await i18n.changeLanguage('zh-CN')
    }
  })

  test('精选集 svg 规范化后以 <svg 开头（引擎前缀分流前提）', () => {
    for (const [name, svg] of Object.entries(CURATED_ICONS)) {
      expect(svg.startsWith('<svg'), `${name} 未规范化`).toBe(true)
    }
  })
})

describe('内置模板按界面语言取列表与内容', () => {
  test('英文语言下列表名/描述与内容为英文版', async () => {
    await i18n.changeLanguage('en')
    try {
      const list = builtinTemplates()
      expect(list[0].name).toBe('Blank map')
      expect(list[1].name).toBe('AI-collab development')
      expect(list[1].content).toContain('# Project name')
    } finally {
      await i18n.changeLanguage('zh-CN')
    }
  })
})
