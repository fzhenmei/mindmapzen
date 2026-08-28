import { describe, expect, test, vi } from 'vitest'
import { centerRoot, fitView } from './viewOps'
import type { MindMapHandle, NodeBox } from '../types/engine'

/** 1000×800 容器；根 (100,50,200×100)，子 (400,0,100×50) → 全树包围盒 (100,0)-(500,150)（根底边 50+100=150） */
const root: NodeBox = {
  left: 100, top: 50, width: 200, height: 100,
  children: [{ left: 400, top: 0, width: 100, height: 50, children: [] }],
}

const makeHandle = (): MindMapHandle =>
  ({
    renderer: { root },
    el: { clientWidth: 1000, clientHeight: 800 },
    view: { reset: vi.fn(), narrow: vi.fn(), enlarge: vi.fn(), x: 0, y: 0, scale: 1, transform: vi.fn() },
    getData: vi.fn(),
    execCommand: vi.fn(),
    setLayout: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  }) as unknown as MindMapHandle

describe('centerRoot', () => {
  test('保持缩放，根中心对到画布中心', () => {
    const mm = makeHandle()
    mm.view.scale = 2
    centerRoot(mm)
    expect(mm.view.scale).toBe(2)
    expect(mm.view.x).toBe(500 - 200 * 2) // 容器中心 500 − 根中心(200)×scale
    expect(mm.view.y).toBe(400 - 100 * 2)
    expect(mm.view.transform).toHaveBeenCalledTimes(1)
  })
  test('根或容器缺失时静默不操作', () => {
    const mm = makeHandle()
    ;(mm as unknown as { renderer: unknown }).renderer = {}
    centerRoot(mm)
    expect(mm.view.transform).not.toHaveBeenCalled()
  })
})

describe('fitView', () => {
  test('按包围盒缩放并居中（0.9 边距）', () => {
    const mm = makeHandle()
    fitView(mm)
    // bbox 400×150 → raw = min(2.5, 5.33)×0.9 = 2.25 → 夹到 2；bbox 中心 y = 0+150/2 = 75
    expect(mm.view.scale).toBe(2)
    expect(mm.view.x).toBe(500 - 300 * 2)
    expect(mm.view.y).toBe(400 - 75 * 2)
    expect(mm.view.transform).toHaveBeenCalledTimes(1)
  })
  test('小图不超 2 倍、超大图不小于 0.1 倍', () => {
    const mm = makeHandle()
    // 放大包围盒到 20000×10000：scale = min(0.05,0.08)*0.9=0.045 → 夹到 0.1
    root.width = 20000
    root.height = 10000
    root.children = []
    fitView(mm)
    expect(mm.view.scale).toBe(0.1)
  })
})
