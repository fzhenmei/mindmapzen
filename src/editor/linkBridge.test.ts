import { describe, expect, test, vi } from 'vitest'
import { appendLinkMark, bridgeLinkToText } from './linkBridge'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { ResolvedLink } from '../services/links'

/** 假引擎：源节点 A 与目标节点 B（getData 命中同一 data 对象，SET_NODE_DATA 真改 text 以验证重建输入） */
const makeFake = () => {
  const fromData = { text: 'A' }
  const tree: EngineNode = {
    data: { text: '根' },
    children: [
      { data: fromData, children: [] },
      { data: { text: 'B' }, children: [] },
    ],
  }
  const fromNode = { getData: (key: string) => (key === 'text' ? fromData.text : undefined) }
  const toNode = { getData: (key: string) => (key === 'text' ? 'B' : undefined) }
  const mm = {
    getData: () => tree,
    execCommand: vi.fn((cmd: string, node: unknown, data: Record<string, unknown>) => {
      if (cmd === 'SET_NODE_DATA' && node === fromNode) Object.assign(fromData, data)
    }),
    renderer: { reRenderNodeCheckChange: vi.fn() },
    rebuildLinks: vi.fn(),
    associativeLine: { creatingStartNode: fromNode, cancelCreateLine: vi.fn() },
  } as unknown as MindMapHandle
  return { mm, fromNode, toNode, fromData }
}

describe('appendLinkMark', () => {
  test('源文本追加 [[目标]] 标记（空源/已含标记均原样拼接）', () => {
    expect(appendLinkMark('A', 'B')).toBe('A [[B]]')
    expect(appendLinkMark('', 'B')).toBe(' [[B]]')
    expect(appendLinkMark('A [[B]]', 'C')).toBe('A [[B]] [[C]]')
  })
})

describe('bridgeLinkToText', () => {
  test('改写源文本并立即按文本重建、自清建线态、阻断引擎 addLine（返回 true）', () => {
    const { mm, toNode, fromNode } = makeFake()
    const stop = bridgeLinkToText(mm, toNode)
    expect(stop).toBe(true)
    // SET_NODE_DATA 只写 text：源文本追加 [[B]]，参数为源节点实例
    expect(mm.execCommand).toHaveBeenCalledWith('SET_NODE_DATA', fromNode, { text: 'A [[B]]' })
    // 文本变长须补按需重渲（裸 SET_NODE_DATA 不重渲，M5b 核验 13）
    expect(mm.renderer?.reRenderNodeCheckChange).toHaveBeenCalledWith(fromNode)
    // 立即重建：按改写后的最新树（getData）解析出 A→B 一条双链
    const links = (mm.rebuildLinks as ReturnType<typeof vi.fn>).mock.calls[0][0] as ResolvedLink[]
    expect(links).toEqual([{ fromPath: '/根/A [[B]]', toPath: '/根/B' }])
    // 引擎 stop 路径不自清（AssociativeLine.js:571）：桥接须调 cancelCreateLine
    expect(mm.associativeLine?.cancelCreateLine).toHaveBeenCalledTimes(1)
  })

  test('无建线源（异常态）放行引擎路径（返回 false，addLine 对空源 no-op 且引擎自清）', () => {
    const { mm, toNode } = makeFake()
    ;(mm.associativeLine as { creatingStartNode?: unknown }).creatingStartNode = null
    expect(bridgeLinkToText(mm, toNode)).toBe(false)
    expect(mm.execCommand).not.toHaveBeenCalled()
    expect(mm.associativeLine?.cancelCreateLine).not.toHaveBeenCalled()
  })

  test('目标无文本：不写标记但仍阻断（true）并自清建线态', () => {
    const { mm } = makeFake()
    const unnamed = { getData: () => undefined }
    expect(bridgeLinkToText(mm, unnamed)).toBe(true)
    expect(mm.execCommand).not.toHaveBeenCalled()
    expect(mm.rebuildLinks).not.toHaveBeenCalled()
    expect(mm.associativeLine?.cancelCreateLine).toHaveBeenCalledTimes(1)
  })
})
