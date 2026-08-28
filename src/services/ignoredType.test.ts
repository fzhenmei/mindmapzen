import { describe, expect, test } from 'vitest'
import { describeIgnoredType } from './ignoredType'

describe('describeIgnoredType：忽略块类型中文名', () => {
  test('已知类型映射中文', () => {
    expect(describeIgnoredType('paragraph')).toBe('段落')
    expect(describeIgnoredType('code')).toBe('代码块')
    expect(describeIgnoredType('table')).toBe('表格')
    expect(describeIgnoredType('image')).toBe('图片')
    expect(describeIgnoredType('blockquote')).toBe('引用')
    expect(describeIgnoredType('thematicBreak')).toBe('分隔线')
    expect(describeIgnoredType('html')).toBe('HTML')
    expect(describeIgnoredType('list')).toBe('列表')
    expect(describeIgnoredType('listItem')).toBe('列表项')
  })

  test('未知类型兜底「其他」', () => {
    expect(describeIgnoredType('definition')).toBe('其他')
    expect(describeIgnoredType('')).toBe('其他')
  })
})
