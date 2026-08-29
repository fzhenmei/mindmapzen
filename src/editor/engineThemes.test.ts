import { describe, expect, test } from 'vitest'
import {
  ENGINE_THEME_NIGHT,
  ENGINE_THEME_PAPER,
  engineThemeName,
  registerZenThemes,
} from './engineThemes'

// 键名以 docs/notes/engine-api.md「M4 核验」(10) 为准：
// 引擎无 activeBorderColor/activeBorderWidth，选中态真实键是各层级的 hoverRectColor
// （hover 与选中共用；环宽由引擎内置，主题仅控色/圆角——见核验 (10) 的 stroke 调用）

/** 晨松（亮）期望值：spec §2 + M12b 计划 Task 2（青松双色，画布=画廊白墙） */
const PAPER = {
  backgroundColor: '#F7F8F7',
  lineColor: '#64707A',
  associativeLineColor: '#64707A',
  root: { fillColor: '#1F2328', color: '#F7F7F7', hoverRectColor: '#1D7A6B' },
  second: { fillColor: '#E3F2EE', color: '#1F2328', borderColor: '#1D7A6B', hoverRectColor: '#1D7A6B' },
  node: { fillColor: '#FFFFFF', color: '#1F2328', borderColor: '#E4E7E6', hoverRectColor: '#1D7A6B' },
}

/** 夜航（暗）期望值：晨松逐键对应反转 */
const NIGHT = {
  backgroundColor: '#14181A',
  lineColor: '#8B9599',
  associativeLineColor: '#8B9599',
  root: { fillColor: '#D6DBDA', color: '#14181A', hoverRectColor: '#4CBFA8' },
  second: { fillColor: '#1D3B36', color: '#D6DBDA', borderColor: '#4CBFA8', hoverRectColor: '#4CBFA8' },
  node: { fillColor: '#1B2022', color: '#D6DBDA', borderColor: '#2A3033', hoverRectColor: '#4CBFA8' },
}

describe('引擎双主题（青松双色）', () => {
  test('两主题对象含必需键且晨松为曲线', () => {
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

  test('晨松（亮）：青松双色逐键断言（spec §2）', () => {
    const t = ENGINE_THEME_PAPER
    expect(t.backgroundColor).toBe(PAPER.backgroundColor)
    expect(t.lineColor).toBe(PAPER.lineColor)
    expect(t.associativeLineColor).toBe(PAPER.associativeLineColor)
    expect(t.root).toMatchObject(PAPER.root)
    expect(t.second).toMatchObject(PAPER.second)
    expect(t.node).toMatchObject(PAPER.node)
  })

  test('夜航（暗）：晨松对应反转逐键断言', () => {
    const t = ENGINE_THEME_NIGHT
    expect(t.backgroundColor).toBe(NIGHT.backgroundColor)
    expect(t.lineColor).toBe(NIGHT.lineColor)
    expect(t.associativeLineColor).toBe(NIGHT.associativeLineColor)
    expect(t.root).toMatchObject(NIGHT.root)
    expect(t.second).toMatchObject(NIGHT.second)
    expect(t.node).toMatchObject(NIGHT.node)
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
