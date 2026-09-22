// src/services/bodyPaste.test.ts —— 粘贴区间标题→加粗纯函数(2026-09-22 正文禁标题):
// 正文不支持标题(md 裸标题行落盘炸成子节点),粘贴入口即转 `**文本**`。
// 区间定位 = before/after 公共前缀+后缀夹出的中段(只动插入内容,既有内容不碰)。
import { describe, expect, test } from 'vitest'
import { convertPastedHeadings } from './bodyPaste'

describe('convertPastedHeadings', () => {
  test('插入区间的 ATX 标题行转加粗,级别抹平', () => {
    const before = '开头\n'
    const after = '开头\n## 大标\n\n#### 四级\n\n结尾'
    expect(convertPastedHeadings(before, after)).toEqual({
      next: '开头\n**大标**\n\n**四级**\n\n结尾',
      converted: 2,
      caret: '开头\n**大标**\n\n**四级**\n\n结尾'.length,
    })
  })

  test('空标题行整行删;# 后多空格收敛', () => {
    const r = convertPastedHeadings('', '前言\n\n#\n\n##   稀疏\n')
    expect(r.next).toBe('前言\n\n\n**稀疏**\n')
    expect(r.converted).toBe(2)
  })

  test('公共前缀里的既有标题不动(只动插入区间);无标题零转换原样返回', () => {
    const r = convertPastedHeadings('## 既有标题\n\n', '## 既有标题\n\n新增段落')
    expect(r).toEqual({ next: '## 既有标题\n\n新增段落', converted: 0, caret: '## 既有标题\n\n新增段落'.length })
  })

  test('围栏代码块内的 # 行不动;插入点位于未闭合围栏内(前缀围栏失衡)整体跳过', () => {
    expect(convertPastedHeadings('', '```js\n# 注释\n```').converted).toBe(0)
    const inFence = convertPastedHeadings('```js\n', '```js\n# x\n')
    expect(inFence.converted).toBe(0)
    expect(inFence.next).toBe('```js\n# x\n')
  })

  test('列表行不动(正文里列表合法);行内 # 非标题不误伤', () => {
    expect(convertPastedHeadings('', '- 项\n\n1. 二\n\nC# 语言\n\n#tag 行').converted).toBe(0)
  })
})
