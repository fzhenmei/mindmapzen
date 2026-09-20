// ideaPlacement 摘要层（spec §6.2/§6.4）：粗摘要=图名+根+一层子节点；细摘要=缩进大纲带节点上限
import { test, expect } from 'vitest'
import { buildCoarseSummary, buildFineSummary, COARSE_CHAR_CAP, MAX_MAPS_FOR_AI, MAX_NODES_PER_MAP } from './ideaPlacement'
import type { ZenNode } from '../../types/tree'

const n = (text: string, children: ZenNode[] = []): ZenNode => ({ text, children })

test('常量取 spec §6.4 初始建议值', () => {
  expect(MAX_MAPS_FOR_AI).toBe(50)
  expect(MAX_NODES_PER_MAP).toBe(200)
  expect(COARSE_CHAR_CAP).toBe(240)
})

test('粗摘要：图名（去 .md）+ 根文本 + 一层子节点文本', () => {
  const tree = n('根主题', [n('子A'), n('子B', [n('孙')])])
  const s = buildCoarseSummary('/ws/项目/项目图.md', tree)
  expect(s.mapPath).toBe('/ws/项目/项目图.md')
  expect(s.name).toBe('项目图')
  expect(s.summary).toBe('根主题：子A、子B')
  expect(s.truncated).toBe(false)
})

test('粗摘要超长截断并标注', () => {
  const tree = n('根'.repeat(300), [n('子')])
  const s = buildCoarseSummary('/ws/a.md', tree)
  expect(s.truncated).toBe(true)
  expect(s.summary.length).toBeLessThanOrEqual(COARSE_CHAR_CAP)
  expect(s.summary.endsWith('…（截断）')).toBe(true)
})

test('细摘要：缩进大纲（- 与层级空格）+ 节点计数', () => {
  const tree = n('根', [n('A', [n('A1'), n('A2')]), n('B')])
  const s = buildFineSummary('/ws/a.md', tree)
  expect(s.nodeCount).toBe(5) // 根 + 4 个后代（nodeCount 计全部节点，与下方 201 用例同口径）
  expect(s.outline).toContain('- 根')
  expect(s.outline).toContain('  - A')
  expect(s.outline).toContain('    - A1')
  expect(s.truncated).toBe(false)
})

test('细摘要节点数超上限：截断到 cap 并标注 truncated', () => {
  const children = Array.from({ length: 250 }, (_, i) => n(`节点${i}`))
  const tree = n('根', children)
  const s = buildFineSummary('/ws/a.md', tree)
  expect(s.truncated).toBe(true)
  expect(s.nodeCount).toBe(201) // 根 + 200 个子（cap 计全部节点）
})
