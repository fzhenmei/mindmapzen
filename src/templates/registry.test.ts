import { describe, expect, test } from 'vitest'
import { BUILTIN_TEMPLATES } from './registry'
import { CURATED_ICONS } from '../editor/zenIcons'
import { extractIconMarkers } from '../services/iconMarkers'

// 模板内容引用的图标标记必须落在精选集内——v2.1 实案：模板说明写了 ::flask 但
// 精选集没有（fire→flame 修正时未补），图标落空渲染为空。本测试锁住这层脱节
describe('内置模板与图标集一致性', () => {
  test('模板 md 中的 ::name 标记全部存在于 CURATED_ICONS', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const used = extractIconMarkers(t.content)
      const missing = used.filter((n) => CURATED_ICONS[n] === undefined)
      expect(missing, `模板 ${t.name} 引用了精选集外的图标：${missing.join(', ')}`).toEqual([])
    }
  })

  test('精选集 svg 规范化后以 <svg 开头（引擎前缀分流前提）', () => {
    for (const [name, svg] of Object.entries(CURATED_ICONS)) {
      expect(svg.startsWith('<svg'), `${name} 未规范化`).toBe(true)
    }
  })
})
