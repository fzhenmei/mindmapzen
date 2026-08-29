import { describe, expect, test, vi } from 'vitest'
import { rebuildEngineLinks } from './MindMapCanvas'
import {
  computeNodePoints,
  computeCubicBezierPathPoints,
} from 'simple-mind-map/src/plugins/associativeLine/associativeLineUtils.js'
import type { MindMapHandle } from '../types/engine'
import type { ResolvedLink } from '../services/links'
import type { LinkAdjust } from '../services/linkAdjust'

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

/** 假引擎句柄：renderer.root 就绪（run() 同步执行，无需 node_tree_render_end 监听），
 *  associativeLine.renderAllLines 为 spy（重建末尾驱动重绘） */
function fakeHandle(root: FakeNode): { mm: MindMapHandle; renderAllLines: ReturnType<typeof vi.fn> } {
  const renderAllLines = vi.fn()
  const mm = {
    renderer: { root },
    associativeLine: { renderAllLines },
    on: vi.fn(),
    off: vi.fn(),
  }
  return { mm: mm as unknown as MindMapHandle, renderAllLines }
}

const link = (fromPath: string, toPath: string): ResolvedLink => ({ fromPath, toPath })

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
