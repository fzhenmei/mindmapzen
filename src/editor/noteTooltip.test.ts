// src/editor/noteTooltip.test.ts —— 悬停窗正文速览截断（2026-09-06 合并）
import { truncateForTip } from './noteTooltip'
import { expect, test } from 'vitest'

test('文本段合计 ≤300 字不截断，mermaid 段不计入限额', () => {
  const segs = [
    { kind: 'text', content: '一'.repeat(300) },
    { kind: 'mermaid', content: 'graph LR\nA-->B' },
  ] as const
  expect(truncateForTip([...segs])).toEqual({ segs: [...segs], truncated: false })
})

test('文本段合计超 300 字：在限额处截断并标记，后续文本段丢弃，mermaid 段保留', () => {
  const segs = [
    { kind: 'text', content: '一'.repeat(200) },
    { kind: 'mermaid', content: 'graph LR\nA-->B' },
    { kind: 'text', content: '二'.repeat(200) },
  ] as const
  const out = truncateForTip([...segs])
  expect(out.truncated).toBe(true)
  expect(out.segs[0].content).toBe('一'.repeat(200))
  expect(out.segs).toHaveLength(3) // 文本（截） + mermaid + 文本（截到 100 字）
  expect(out.segs[2]).toEqual({ kind: 'text', content: '二'.repeat(100) })
})
