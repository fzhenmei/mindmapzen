import { describe, expect, test } from 'vitest'
import { extractIconMarkers, hasIconMarkers, injectIconMarkers, stripIconMarkers } from './iconMarkers'

describe('iconMarkers（M18 方案 A：句尾 ::name 标记）', () => {
  test('无标记快速路径：strip 原样返回、extract 空', () => {
    expect(stripIconMarkers('普通节点')).toBe('普通节点')
    expect(stripIconMarkers('a::b 句中冒号')).toBe('a::b 句中冒号')
    expect(hasIconMarkers('句中 ::flag 不是行尾')).toBe(false)
    expect(extractIconMarkers('普通节点')).toEqual([])
  })

  test('单/多标记：剥净与提取（保序去重）', () => {
    expect(stripIconMarkers('待办 ::flag')).toBe('待办')
    expect(stripIconMarkers('重要 ::flag ::star ::flag')).toBe('重要')
    expect(extractIconMarkers('重要 ::flag ::star ::flag')).toEqual(['flag', 'star'])
    expect(extractIconMarkers('告警 ::alert-triangle')).toEqual(['alert-triangle'])
  })

  test('inject 与 strip 互逆；文本尾随空白收敛', () => {
    const text = '节点'
    expect(injectIconMarkers(text, ['flag', 'star'])).toBe('节点 ::flag ::star')
    expect(stripIconMarkers(injectIconMarkers(text, ['flag']))).toBe(text)
    expect(injectIconMarkers(text, [])).toBe(text)
  })

  test('非法名（大写/下划线/中文）不构成标记——文本不受影响', () => {
    expect(extractIconMarkers('x ::Flag')).toEqual([])
    expect(extractIconMarkers('x ::a_b')).toEqual([])
    expect(hasIconMarkers('x ::Flag')).toBe(false)
  })
})
