import { describe, expect, test } from 'vitest'
import { absolutizeImagePaths } from './aiImagePaths'

const HEADER = '> 图片为本地绝对路径，请用工具读取'

describe('absolutizeImagePaths（复制 md 给 AI：图片相对→绝对）', () => {
  test('相对路径拼 wsDir 前置 + 头部说明行；alt 原样保留', () => {
    expect(absolutizeImagePaths('## 配图 ![图注](assets/配图.png)\n', '/ws')).toBe(
      `${HEADER}\n\n## 配图 ![图注](/ws/assets/配图.png)\n`,
    )
  })
  test('Windows 反斜杠统一归一为正斜杠（wsDir 与 src 皆然）', () => {
    expect(absolutizeImagePaths('![](assets\\子目录\\a.png)', 'C:\\Users\\z\\docs')).toBe(
      `${HEADER}\n\n![](C:/Users/z/docs/assets/子目录/a.png)`,
    )
  })
  test('路径含空格 → 目标以 <...> 包裹（wsDir 带空格同理）', () => {
    expect(absolutizeImagePaths('![](my pic.png)', '/ws')).toBe(`${HEADER}\n\n![](<` + '/ws/my pic.png>)')
    expect(absolutizeImagePaths('![](assets/a.png)', 'C:/my docs')).toBe(
      `${HEADER}\n\n![](<C:/my docs/assets/a.png>)`,
    )
  })
  test('已是绝对路径：不拼 wsDir，仅归一分隔符（仍加头注——同为本地绝对路径）', () => {
    expect(absolutizeImagePaths('![](D:\\pics\\a.png)', '/ws')).toBe(`${HEADER}\n\n![](D:/pics/a.png)`)
  })
  test('http(s)/data 外链与内嵌不动，且不加头注（无本地路径可读）', () => {
    const md = '![](https://example.com/a.png) 与 ![](data:image/png;base64,AAAA)'
    expect(absolutizeImagePaths(md, '/ws')).toBe(md)
  })
  test('无图片引用：原文恒等（不加头注）', () => {
    const md = '# 根\n\n## 新分支\n'
    expect(absolutizeImagePaths(md, '/ws')).toBe(md)
  })
  test('双链标记 [[名]] 不是图片语法，不受影响', () => {
    const md = '# 见 [[B]]\n'
    expect(absolutizeImagePaths(md, '/ws')).toBe(md)
  })
  test('多图逐个替换，头注只加一次', () => {
    expect(absolutizeImagePaths('![](a.png) ![](b.png)', '/ws')).toBe(`${HEADER}\n\n![](/ws/a.png) ![](/ws/b.png)`)
  })
})
