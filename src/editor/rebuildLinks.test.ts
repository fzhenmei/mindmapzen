import { describe, expect, test, vi } from 'vitest'
import { applyRegistryToEngine, rebuildEngineLinks } from './MindMapCanvas'
import {
  computeNodePoints,
  computeCubicBezierPathPoints,
} from 'simple-mind-map/src/plugins/associativeLine/associativeLineUtils.js'
import type { MindMapHandle } from '../types/engine'
import type { ResolvedLink } from '../services/links'
import type { LinkAdjust } from '../services/linkAdjust'
import type { LinkRegistry } from './linkRegistry'

/** 假渲染树节点实例（引擎 MindMapNode 最小契约）：getData() 无参返回 data 本体活引用，
 *  getData(key) 返回单键；left/top/width/height = 布局后几何（缺省即"几何不可得"防御场景） */
interface FakeNode {
  data: Record<string, unknown>
  children?: FakeNode[]
  left?: number
  top?: number
  width?: number
  height?: number
  getData(key?: string): unknown
}

/** 假数据树节点（renderTree 形态）：{data, children}，与渲染实例共享 data 本体（引擎现实） */
interface FakeDataNode {
  data: Record<string, unknown>
  children?: FakeDataNode[]
}

const fakeNode = (
  data: Record<string, unknown>,
  children: FakeNode[] = [],
  geo?: { left: number; top: number; width: number; height: number },
): FakeNode => ({
  data,
  children,
  ...(geo ?? {}),
  getData(key?: string) {
    return key === undefined ? data : data[key]
  },
})

/** 渲染实例树 → 同构数据树（共享 data 本体；全展开态两者 children 一致） */
const toDataTree = (n: FakeNode): FakeDataNode => ({
  data: n.data,
  children: (n.children ?? []).map(toDataTree),
})

/** 假引擎句柄：renderer.root 与 renderTree 就绪（run() 同步执行，无需 node_tree_render_end 监听），
 *  associativeLine.renderAllLines 为 spy（重建末尾驱动重绘）；getData/command 供净化链种子使用 */
function fakeHandle(
  root: FakeNode,
  dataRoot?: FakeDataNode,
): { mm: MindMapHandle; renderAllLines: ReturnType<typeof vi.fn> } {
  const renderAllLines = vi.fn()
  const renderTree = dataRoot ?? toDataTree(root)
  const mm = {
    renderer: { root, renderTree, reRenderNodeCheckChange: vi.fn() },
    associativeLine: { renderAllLines },
    on: vi.fn(),
    off: vi.fn(),
    getData: () => renderTree,
    command: { history: [] as string[], activeHistoryIndex: 0 },
  }
  return { mm: mm as unknown as MindMapHandle, renderAllLines }
}

const link = (
  fromPath: string,
  toPath: string,
  ordinals?: { fromOrdinal?: number; toOrdinal?: number },
): ResolvedLink => ({ fromPath, toPath, ...ordinals })

describe('rebuildEngineLinks 恢复胶水层（M5d Task 5）', () => {
  test('清键前 uid 留档优先于 sidecar：刚拖的弯不被旧 sidecar 回退；全树连线五键清空', () => {
    const aData: Record<string, unknown> = {
      text: 'A',
      uid: 'u1',
      associativeLineTargets: ['u2'],
      associativeLineTargetControlOffsets: [
        [
          { x: 9, y: 9 },
          { x: 9, y: 9 },
        ],
      ],
      associativeLineText: { u2: '旧连线文本' },
    }
    const rootData: Record<string, unknown> = { text: '根', uid: 'u0', associativeLineStyle: { u1: {} } }
    const { mm, renderAllLines } = fakeHandle(
      fakeNode(rootData, [fakeNode(aData), fakeNode({ text: 'B', uid: 'u2' })]),
    )
    const adjust: LinkAdjust = { '/根/A->/根/B': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 } }
    rebuildEngineLinks(mm, [link('/根/A', '/根/B')], adjust)
    expect(aData.associativeLineTargets).toEqual(['u2'])
    // 引擎现存差值（按 uid 留档）胜出，sidecar 同键条目不覆盖
    expect(aData.associativeLineTargetControlOffsets).toEqual([
      [
        { x: 9, y: 9 },
        { x: 9, y: 9 },
      ],
    ])
    // 五键全清（含 text/style 等派生键），连带渲染器重绘触发
    expect(aData.associativeLineText).toBeUndefined()
    expect(rootData.associativeLineStyle).toBeUndefined()
    expect(renderAllLines).toHaveBeenCalledTimes(1)
  })

  test('sidecar 回填 + 空洞稠密化：未拖弯位按 addLine 同款算式补引擎默认差值', () => {
    const aData: Record<string, unknown> = { text: 'A', uid: 'u1' }
    const b = fakeNode({ text: 'B', uid: 'u2' }, [], { left: 200, top: 0, width: 50, height: 20 })
    const c = fakeNode({ text: 'C', uid: 'u3' }, [], { left: 200, top: 200, width: 50, height: 20 })
    const a = fakeNode(aData, [], { left: 0, top: 100, width: 50, height: 20 })
    const rootData: Record<string, unknown> = { text: '根', uid: 'u0' }
    const { mm } = fakeHandle(fakeNode(rootData, [a, b, c]))
    rebuildEngineLinks(mm, [link('/根/A', '/根/B'), link('/根/A', '/根/C')], {
      '/根/A->/根/B': { cx1: 5, cy1: 6, cx2: 7, cy2: 8 },
    })
    expect(aData.associativeLineTargets).toEqual(['u2', 'u3'])
    const offsets = aData.associativeLineTargetControlOffsets as Array<[unknown, unknown]>
    expect(offsets[0]).toEqual([
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ])
    // 空洞位 = 引擎默认差值（测试侧以同一引擎算式复算，锁定与 addLine 公式一致）
    const [sp, ep] = computeNodePoints(a, c)
    const [c1, c2] = computeCubicBezierPathPoints(sp.x, sp.y, ep.x, ep.y)
    expect(offsets[1]).toEqual([
      { x: c1.x - sp.x, y: c1.y - sp.y },
      { x: c2.x - ep.x, y: c2.y - ep.y },
    ])
  })

  test('全线无弯曲：targets 照写、不写 offsets（渲染回落默认曲线）', () => {
    const aData: Record<string, unknown> = { text: 'A', uid: 'u1' }
    const { mm } = fakeHandle(
      fakeNode({ text: '根', uid: 'u0' }, [fakeNode(aData), fakeNode({ text: 'B', uid: 'u2' })]),
    )
    rebuildEngineLinks(mm, [link('/根/A', '/根/B')])
    expect(aData.associativeLineTargets).toEqual(['u2'])
    expect(aData.associativeLineTargetControlOffsets).toBeUndefined()
  })

  test('几何不可得（防御）：补默认差值失败时整节点放弃写 offsets，不抛异常', () => {
    const aData: Record<string, unknown> = { text: 'A', uid: 'u1' }
    // 无几何（left/top/width/height 缺省）：混合"adjust 落位 + 空洞"时默认差值算不出 → 整节点放弃
    const { mm, renderAllLines } = fakeHandle(
      fakeNode(
        { text: '根', uid: 'u0' },
        [fakeNode(aData), fakeNode({ text: 'B', uid: 'u2' }), fakeNode({ text: 'C', uid: 'u3' })],
      ),
    )
    expect(() =>
      rebuildEngineLinks(mm, [link('/根/A', '/根/B'), link('/根/A', '/根/C')], {
        '/根/A->/根/B': { cx1: 5, cy1: 6, cx2: 7, cy2: 8 },
      }),
    ).not.toThrow()
    expect(aData.associativeLineTargets).toEqual(['u2', 'u3'])
    expect(aData.associativeLineTargetControlOffsets).toBeUndefined()
    expect(renderAllLines).toHaveBeenCalledTimes(1)
  })
})

// 收起态回归（2026-09 数据丢失修复）：渲染树只含可见节点，收起子树内的节点只存在于数据树
// （renderer.renderTree）。净化与重建若走渲染树，隐藏节点既不被收割/剥离（文本残留 [[..]] 标记，
// 后续文本编辑即吞掉连线唯一事实源），targets 也写不上（展开后无线）——两缺陷合谋构成
// 「收起→保存→重开→编辑→连线永久丢失」。以下用例锁定：数据树维度全量覆盖隐藏节点。
describe('rebuildEngineLinks / applyRegistryToEngine 收起态（隐藏节点只存在于数据树）', () => {
  /** 收起场景装配：数据树 根 → {P(收起) → A, B}；渲染树缺 A（P 无子）。data 本体两侧共享 */
  const setupCollapsed = () => {
    const aData: Record<string, unknown> = { text: 'A', uid: 'u1' }
    const bData: Record<string, unknown> = { text: 'B', uid: 'u2' }
    const pData: Record<string, unknown> = { text: 'P', uid: 'u3', expand: false }
    const rootData: Record<string, unknown> = { text: '根', uid: 'u0' }
    const dataRoot = {
      data: rootData,
      children: [
        { data: pData, children: [{ data: aData }] },
        { data: bData },
      ],
    }
    const renderRoot = fakeNode(rootData, [fakeNode(pData), fakeNode(bData)])
    return { aData, bData, dataRoot, renderRoot }
  }

  test('重建：隐藏源节点的 targets 写入数据树（展开重渲染即自动画线，引擎 node_tree_render_end 驱动）', () => {
    const { aData, dataRoot, renderRoot } = setupCollapsed()
    const { mm } = fakeHandle(renderRoot, dataRoot)
    rebuildEngineLinks(mm, [link('/根/P/A', '/根/B')])
    expect(aData.associativeLineTargets).toEqual(['u2'])
  })

  test('重建：隐藏节点上的陈旧 targets/offsets 同样清空（全量五键清除，防陈旧线复活）', () => {
    const { aData, dataRoot, renderRoot } = setupCollapsed()
    aData.associativeLineTargets = ['u2']
    aData.associativeLineTargetControlOffsets = [[{ x: 1, y: 1 }, { x: 1, y: 1 }]]
    const { mm } = fakeHandle(renderRoot, dataRoot)
    rebuildEngineLinks(mm, []) // 无线重建：清空语义
    expect(aData.associativeLineTargets).toBeUndefined()
    expect(aData.associativeLineTargetControlOffsets).toBeUndefined()
  })

  test('净化：隐藏节点文本残留 [[..]] 也收割进注册表并剥离（展开后文本干净、条目不丢）', () => {
    const { aData, dataRoot, renderRoot } = setupCollapsed()
    aData.text = 'A [[B]]' // 重开残留标记（收起态净化遗漏的现场）
    const { mm } = fakeHandle(renderRoot, dataRoot)
    const reg: LinkRegistry = { byUid: new Map() }
    applyRegistryToEngine(mm, reg)
    expect(reg.byUid.get('u1')).toEqual(['B']) // 收割：注册表含隐藏节点条目
    expect(aData.text).toBe('A') // 剥离：隐藏节点文本不残留标记
    expect(aData.associativeLineTargets).toEqual(['u2']) // 重建：targets 落位（展开即画线）
  })
})

// 2026-09-03 同名消歧（spec §4.4）：byPath 从"后写覆盖（末位胜出）"改"路径→节点数组 + 序号取位"
describe('rebuildEngineLinks 孪生序号取位', () => {
  /** 同父同名孪生装配：根 → A(u1)、S(u2)、S(u3) */
  const setupTwins = () => {
    const aData: Record<string, unknown> = { text: 'A', uid: 'u1' }
    const s1: Record<string, unknown> = { text: 'S', uid: 'u2' }
    const s2: Record<string, unknown> = { text: 'S', uid: 'u3' }
    const rootData: Record<string, unknown> = { text: '根', uid: 'u0' }
    const { mm } = fakeHandle(fakeNode(rootData, [fakeNode(aData), fakeNode(s1), fakeNode(s2)]))
    return { mm, aData, s1, s2 }
  }

  test('目标序号落位：toOrdinal 2 连到第 2 孪生；无序号 = 首位（缺省语义变更点）', () => {
    const { mm, aData } = setupTwins()
    rebuildEngineLinks(mm, [link('/根/A', '/根/S'), link('/根/A', '/根/S', { toOrdinal: 2 })])
    expect(aData.associativeLineTargets).toEqual(['u2', 'u3'])
  })

  test('序号越界钳位：#5 实存 2 孪生 → 钳到末位（线保持可见）', () => {
    const { mm, aData } = setupTwins()
    rebuildEngineLinks(mm, [link('/根/A', '/根/S', { toOrdinal: 5 })])
    expect(aData.associativeLineTargets).toEqual(['u3'])
  })

  test('源端序号落位：孪生源 fromOrdinal 2 → targets 写到第 2 孪生上', () => {
    const s1: Record<string, unknown> = { text: 'S', uid: 'u1' }
    const s2: Record<string, unknown> = { text: 'S', uid: 'u4' }
    const b: Record<string, unknown> = { text: 'B', uid: 'u2' }
    const rootData: Record<string, unknown> = { text: '根', uid: 'u0' }
    const { mm } = fakeHandle(
      fakeNode(rootData, [fakeNode(s1), fakeNode(s2), fakeNode(b)]),
    )
    rebuildEngineLinks(mm, [link('/根/S', '/根/B', { fromOrdinal: 2 })])
    expect(s1.associativeLineTargets).toBeUndefined()
    expect(s2.associativeLineTargets).toEqual(['u2'])
  })
})
