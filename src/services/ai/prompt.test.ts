// src/services/ai/prompt.test.ts —— uid 缩进树与 system prompt（Task 6，spec §3.1）
import { expect, test } from 'vitest'
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

test('selectionLine', () => {
  expect(selectionLine(null)).toBeNull()
  expect(selectionLine({ uid: 'b8c1', text: '子节点 一' })).toBe('[b8c1] 子节点 一')
})
