import { describe, expect, test } from 'vitest'
import {
  ENGINE_THEME_NIGHT,
  ENGINE_THEME_PAPER,
  engineThemeName,
  registerZenThemes,
} from './engineThemes'

// 键名以 docs/notes/engine-api.md「M4 核验」(10) 为准：
// 引擎无 activeBorderColor/activeBorderWidth，选中态真实键是各层级的 hoverRectColor
describe('引擎双主题', () => {
  test('两主题对象含必需键且纸墨为曲线', () => {
    for (const t of [ENGINE_THEME_PAPER, ENGINE_THEME_NIGHT]) {
      expect(t.backgroundColor).toMatch(/^#/)
      expect(t.lineColor).toMatch(/^#/)
      expect(t.root.fillColor).toMatch(/^#/)
      expect(t.root.hoverRectColor).toMatch(/^#/)
      expect(t.second.fillColor).toMatch(/^#/)
      expect(t.second.hoverRectColor).toMatch(/^#/)
      expect(t.node.fillColor).toMatch(/^#/)
      expect(t.node.hoverRectColor).toMatch(/^#/)
    }
    expect(ENGINE_THEME_PAPER.lineStyle).toBe('curve')
  })

  test('engineThemeName 映射', () => {
    expect(engineThemeName('light')).toBe('zen-paper')
    expect(engineThemeName('dark')).toBe('zen-night')
  })

  test('registerZenThemes 幂等可重复调用', () => {
    expect(() => {
      registerZenThemes()
      registerZenThemes()
    }).not.toThrow()
  })
})
