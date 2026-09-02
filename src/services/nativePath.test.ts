import { describe, expect, it } from 'vitest'
import { toNativePath } from './nativePath'

describe('toNativePath（面向用户的路径出口分隔符归一，2026-09 修复）', () => {
  it('Windows：/ 全部归一为 \\，含混入内部拼接 / 的形态', () => {
    expect(toNativePath('C:\\Users\\z\\Documents\\测试/投教课堂.md', true)).toBe(
      'C:\\Users\\z\\Documents\\测试\\投教课堂.md',
    )
    expect(toNativePath('C:/Users/z/文档/a.md', true)).toBe('C:\\Users\\z\\文档\\a.md')
  })

  it('非 Windows：原样返回（Unix / 即原生形态）', () => {
    expect(toNativePath('/ws/a.md', false)).toBe('/ws/a.md')
    expect(toNativePath('C:\\ws\\a.md', false)).toBe('C:\\ws\\a.md')
  })

  it('无斜杠与空串恒等', () => {
    expect(toNativePath('a.md', true)).toBe('a.md')
    expect(toNativePath('', true)).toBe('')
  })
})
