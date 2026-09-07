import { describe, expect, test } from 'vitest'
import { mdOutline } from './mdOutline'

describe('mdOutline（预览大纲提取）', () => {
  test('按文档序产出标题条目（depth 与剥 # 后文本）', () => {
    const md = ['# 根', '## 子甲', '### 孙', '## 子乙', '正文段落'].join('\n')
    expect(mdOutline(md)).toEqual([
      { id: 'zen-h-0', depth: 1, text: '根' },
      { id: 'zen-h-1', depth: 2, text: '子甲' },
      { id: 'zen-h-2', depth: 3, text: '孙' },
      { id: 'zen-h-3', depth: 2, text: '子乙' },
    ])
  })
  test('文本按显示层口径剥标记（[[双链]]/::图标/插图，与画布预览同口径）', () => {
    const md = '# 根 [[目标]] ::flag ![alt](a.png)'
    expect(mdOutline(md)).toEqual([{ id: 'zen-h-0', depth: 1, text: '根' }])
  })
  test('标签标记一并剥净（#tag，含与图标/插图共存序）', () => {
    const md = '# 根 #采购 ::flag ![alt](a.png)'
    expect(mdOutline(md)).toEqual([{ id: 'zen-h-0', depth: 1, text: '根' }])
  })
  test('围栏代码块内的 # 行不算标题', () => {
    const md = ['# 根', '```', '# 注释伪标题', '```', '## 真'].join('\n')
    expect(mdOutline(md).map((h) => h.text)).toEqual(['根', '真'])
  })
  test('setext 下划线式标题按 remark 口径一并计入（与渲染对齐）', () => {
    const md = '标题甲\n===\n\n## 标准'
    expect(mdOutline(md).map((h) => h.depth)).toEqual([1, 2])
  })
  test('无标题与空文档返回空数组', () => {
    expect(mdOutline('')).toEqual([])
    expect(mdOutline('只有正文\n没有标题')).toEqual([])
  })
})
