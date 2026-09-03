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
    execCommand: vi.fn(),
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

  // v0.7.0 删线验收实案：引擎 stop 路径跳过悬停目标去激活（:572-574）——桥接须自理，
  // 否则目标高亮残留 + 尾随 data_change 清 activeLine 使删线失效
  test('悬停目标已激活时补 SET_NODE_ACTIVE 去激活；未激活/无目标不执行命令', () => {
    const active = makeFake()
    const overlap = { getData: (key: string) => key === 'isActive' }
    ;(active.mm.associativeLine as { overlapNode?: unknown }).overlapNode = overlap
    bridgeLinkToRegistry(active.mm, active.registry, active.toNode, active.onDataChanged)
    expect(active.mm.execCommand).toHaveBeenCalledWith('SET_NODE_ACTIVE', overlap, false)

    const idle = makeFake() // 无 overlapNode：不执行命令
    bridgeLinkToRegistry(idle.mm, idle.registry, idle.toNode, idle.onDataChanged)
    expect(idle.mm.execCommand).not.toHaveBeenCalled()
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

// v1.1 验收 Bug「连线有时能连有时不能连」：目标名在全树不唯一时，裸名经
// registryToLinks 宽容丢弃（多命中）→ 线永不绘制且无反馈。修复：桥接改推全路径消歧。
describe('桥接消歧：目标名不唯一时推全路径', () => {
  const makeDup = () => {
    // 两处同名 B：/根/B 与 /根/A/B（不同子树，全路径可消歧）
    const tree: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [
        { data: { text: 'B', uid: 'u9' }, children: [] },
        { data: { text: 'A', uid: 'u1' }, children: [{ data: { text: 'B', uid: 'u2' }, children: [] }] },
      ],
    }
    const fromNode = { getData: (k: string) => (k === 'text' ? 'A' : k === 'uid' ? 'u1' : undefined) }
    const toNode = { getData: (k: string) => (k === 'text' ? 'B' : k === 'uid' ? 'u2' : undefined) }
    const mm = {
      getData: () => tree,
      rebuildLinks: vi.fn(),
      execCommand: vi.fn(),
      associativeLine: { creatingStartNode: fromNode, cancelCreateLine: vi.fn() },
    } as unknown as MindMapHandle
    return { mm, registry: { byUid: new Map() } as LinkRegistry, toNode }
  }

  test('目标名唯一：仍推裸名（md 简洁）', () => {
    const f = makeDup()
    // 先破坏唯一性：把 u9 文本改为 C → B 唯一
    ;(f.mm.getData() as EngineNode).children![0].data.text = 'C'
    const { toNode } = f
    const onData = vi.fn()
    bridgeLinkToRegistry(f.mm, f.registry, toNode, onData)
    expect(f.registry.byUid.get('u1')).toEqual(['B'])
  })

  test('目标名不唯一：推全路径形式，registryToLinks 可精确解析', () => {
    const f = makeDup()
    const onData = vi.fn()
    bridgeLinkToRegistry(f.mm, f.registry, f.toNode, onData)
    expect(f.registry.byUid.get('u1')).toEqual(['/根/A/B'])
    // 重建参数直接带全路径 toPath → resolveLinks 按路径命中 → 线绘制
    expect(f.mm.rebuildLinks).toHaveBeenCalledWith([
      { fromPath: '/根/A', toPath: '/根/A/B' },
    ])
  })
})

// 2026-09-03 同父同名孪生（断点②目标端）：路径也相同时靠 #n 序号精确指认孪生。
// 统一标记规则与 harvestRegistry/identityMarker 同语义：名称唯一→裸名，否则路径，孪生 n>1 缀 #n
describe('桥接消歧：同父同名孪生按 #n 指认', () => {
  const makeTwin = () => {
    // 根下：A（源）、B、B（同父同名孪生对）
    const tree: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [
        { data: { text: 'A', uid: 'u1' }, children: [] },
        { data: { text: 'B', uid: 'u2' }, children: [] },
        { data: { text: 'B', uid: 'u3' }, children: [] },
      ],
    }
    const fromNode = { getData: (k: string) => (k === 'text' ? 'A' : k === 'uid' ? 'u1' : undefined) }
    const twinOf = (uid: string) => ({
      getData: (k: string) => (k === 'text' ? 'B' : k === 'uid' ? uid : undefined),
    })
    const mm = {
      getData: () => tree,
      rebuildLinks: vi.fn(),
      execCommand: vi.fn(),
      associativeLine: { creatingStartNode: fromNode, cancelCreateLine: vi.fn() },
    } as unknown as MindMapHandle
    return { mm, registry: { byUid: new Map() } as LinkRegistry, twinOf }
  }

  test('连到首个孪生：推裸路径（不缀 #1）', () => {
    const f = makeTwin()
    bridgeLinkToRegistry(f.mm, f.registry, f.twinOf('u2'), vi.fn())
    expect(f.registry.byUid.get('u1')).toEqual(['/根/B'])
  })

  test('连到第 2 孪生：推 路径#2，rebuildLinks 带 toOrdinal 精确落位', () => {
    const f = makeTwin()
    bridgeLinkToRegistry(f.mm, f.registry, f.twinOf('u3'), vi.fn())
    expect(f.registry.byUid.get('u1')).toEqual(['/根/B#2'])
    expect(f.mm.rebuildLinks).toHaveBeenCalledWith([
      { fromPath: '/根/A', toPath: '/根/B', toOrdinal: 2 },
    ])
  })
})
