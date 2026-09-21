// src/services/ai/prompt.test.ts —— uid 缩进树与 system prompt（Task 6，spec §3.1）
import { describe, expect, test } from 'vitest'
import { buildSystemPrompt, selectionLine, treeToUidOutline } from './prompt'
import type { EngineNode } from '../../types/engine'

const tree: EngineNode = {
  data: { text: '根节点', uid: 'a3f2' },
  children: [
    { data: { text: '子节点 一', uid: 'b8c1' }, children: [{ data: { text: '孙节点', uid: 'd1e2' } }] },
    { data: { text: '子节点二', uid: 'c7d0' } },
  ],
}

test('treeToUidOutline：缩进 + [uid] 前缀 + 文本压平空白', () => {
  expect(treeToUidOutline(tree)).toEqual([
    '- [a3f2] 根节点',
    '  - [b8c1] 子节点 一',
    '    - [d1e2] 孙节点',
    '  - [c7d0] 子节点二',
  ])
})

test('buildSystemPrompt：含树全文与工具纪律', () => {
  const p = buildSystemPrompt(tree)
  expect(p).toContain('- [a3f2] 根节点')
  expect(p).toContain('uid')
})

test('buildSystemPrompt(null)：空图不抛异常', () => {
  expect(buildSystemPrompt(null)).toContain('（空）')
})

test('工作纪律含新工具指引', () => {
  const p = buildSystemPrompt(tree)
  expect(p).toContain('get_node_detail')
  expect(p).toContain('视图操作')
})

test('selectionLine', () => {
  expect(selectionLine(null)).toBeNull()
  expect(selectionLine({ uid: 'b8c1', text: '子节点 一' })).toBe('[b8c1] 子节点 一')
})

// 快照轻量标记(spec §2):有则标无则省;图标剥 zen_ 前缀滤徽章;正文首行截 30 字;连线尾标 uid
const markedNode = (over: Record<string, unknown>): EngineNode => ({
  data: { text: '节点', uid: 'n1', ...over },
  children: [],
})

describe('快照轻量标记', () => {
  test('全空:纯 uid+文本行,零装饰', () => {
    expect(treeToUidOutline(markedNode({}))).toEqual(['- [n1] 节点'])
  })

  test('标签/图标/正文摘要各就各位', () => {
    const lines = treeToUidOutline(markedNode({
      tag: ['待办', '重要'],
      icon: ['zen_flag', 'zen_status-todo'],
      body: '第一行正文\n第二行',
    }))
    expect(lines).toEqual(['- [n1] 节点 🏷待办/重要 ☰flag 📝第一行正文'])
  })

  test('正文超 30 字截断', () => {
    const lines = treeToUidOutline(markedNode({ body: 'x'.repeat(40) }))
    expect(lines[0]).toContain(`📝${'x'.repeat(30)}`)
    expect(lines[0]).not.toContain(`📝${'x'.repeat(31)}`)
  })

  test('body 空串不标;连线尾标 uid 直出', () => {
    const lines = treeToUidOutline(markedNode({
      body: '',
      associativeLineTargets: ['n2', 'n3'],
    }))
    expect(lines).toEqual(['- [n1] 节点 →[n2][n3]'])
  })

  test('非字符串 icon/tag 项静默滤除(引擎脏数据防御)', () => {
    const lines = treeToUidOutline(markedNode({ tag: ['a', 3], icon: [null, 'zen_star'] }))
    expect(lines).toEqual(['- [n1] 节点 🏷a ☰star'])
  })
})
