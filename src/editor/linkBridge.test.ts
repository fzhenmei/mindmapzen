import { describe, expect, test, vi } from 'vitest'
import { bridgeLinkToRegistry } from './linkBridge'
import { buildRegistry, type LinkRegistry } from './linkRegistry'
import type { EngineNode, MindMapHandle } from '../types/engine'

/** 假引擎：源节点 A（uid u1）与目标节点 B（uid u2），树带 uid（净化后文本无标记） */
const makeFake = () => {
  const tree: EngineNode = {
    data: { text: '根', uid: 'u0' },
    children: [
      { data: { text: 'A', uid: 'u1' }, children: [] },
      { data: { text: 'B', uid: 'u2' }, children: [] },
    ],
  }
  const fromNode = {
    getData: (key: string) => (key === 'text' ? 'A' : key === 'uid' ? 'u1' : undefined),
  }
  const toNode = {
    getData: (key: string) => (key === 'text' ? 'B' : key === 'uid' ? 'u2' : undefined),
  }
  const mm = {
    getData: () => tree,
    rebuildLinks: vi.fn(),
    associativeLine: { creatingStartNode: fromNode, cancelCreateLine: vi.fn() },
  } as unknown as MindMapHandle
  const registry: LinkRegistry = { byUid: new Map() }
  const onDataChanged = vi.fn()
  return { mm, registry, onDataChanged, toNode, fromNode }
}

describe('bridgeLinkToRegistry', () => {
  test('注册表 push + 立即按注册表重建 + 触发保存链 + 自清建线态 + 阻断引擎 addLine（返回 true）', () => {
    const { mm, registry, onDataChanged, toNode } = makeFake()
    const stop = bridgeLinkToRegistry(mm, registry, toNode, onDataChanged)
    expect(stop).toBe(true)
    // 不再改写文本：注册表以 uid 为键追加目标名
    expect(registry.byUid.get('u1')).toEqual(['B'])
    // 立即重建：按注册表解析出 /根/A → /根/B 一条双链
    expect(mm.rebuildLinks).toHaveBeenCalledTimes(1)
    expect(mm.rebuildLinks).toHaveBeenCalledWith([{ fromPath: '/根/A', toPath: '/根/B' }])
    // 保存链触发：宿主据此置脏，自动保存把句尾标记落 md（显示文本全程不动）
    expect(onDataChanged).toHaveBeenCalledTimes(1)
    // 引擎 stop 路径不自清（AssociativeLine.js:571）：桥接须调 cancelCreateLine
    expect(mm.associativeLine?.cancelCreateLine).toHaveBeenCalledTimes(1)
  })

  test('同目标重复画线去重（注册表条目唯一）', () => {
    const { mm, registry, onDataChanged, toNode } = makeFake()
    bridgeLinkToRegistry(mm, registry, toNode, onDataChanged)
    bridgeLinkToRegistry(mm, registry, toNode, onDataChanged)
    expect(registry.byUid.get('u1')).toEqual(['B'])
  })

  test('无建线源（异常态）放行引擎路径（返回 false，引擎对空源 no-op 且自清）', () => {
    const { mm, registry, onDataChanged, toNode } = makeFake()
    ;(mm.associativeLine as { creatingStartNode?: unknown }).creatingStartNode = null
    expect(bridgeLinkToRegistry(mm, registry, toNode, onDataChanged)).toBe(false)
    expect(registry.byUid.size).toBe(0)
    expect(mm.rebuildLinks).not.toHaveBeenCalled()
    expect(onDataChanged).not.toHaveBeenCalled()
    expect(mm.associativeLine?.cancelCreateLine).not.toHaveBeenCalled()
  })

  test('目标无文本：不 push 不重建不触发保存链，但仍阻断（true）并自清建线态', () => {
    const { mm, registry, onDataChanged } = makeFake()
    const unnamed = { getData: () => undefined }
    expect(bridgeLinkToRegistry(mm, registry, unnamed, onDataChanged)).toBe(true)
    expect(registry.byUid.size).toBe(0)
    expect(mm.rebuildLinks).not.toHaveBeenCalled()
    expect(onDataChanged).not.toHaveBeenCalled()
    expect(mm.associativeLine?.cancelCreateLine).toHaveBeenCalledTimes(1)
  })
})

describe('净化后桥接与注册表闭环（组合语义）', () => {
  test('净化树 + 桥接 push 后：注册表条目 = 打开收割 ∪ 桥接追加（去重）', () => {
    const { mm, registry, toNode } = makeFake()
    // 模拟打开净化：树曾含 [[C]]，收割后文本已剥离
    const tree = mm.getData()
    tree.children![0]!.data.text = 'A [[C]]'
    buildRegistry(tree, registry)
    tree.children![0]!.data.text = 'A'
    bridgeLinkToRegistry(mm, registry, toNode)
    expect(registry.byUid.get('u1')).toEqual(['C', 'B'])
  })
})
