// src/editor/undoSeed.test.ts —— 撤销历史栈卫生单元测试（v1.1）：
// ①基线种子：引擎构造器自播种子（addHistoryOnInit 默认 true）捕获未净化构造数据且与宿主种子竞态，
// 本仓已关闭自播（MindMapCanvas 构造 opts），seedUndoBaseline 在打开净化完成后直写净化态基线，
// 是撤销栈的唯一基线来源；直写零事件（不置脏）。
// ②瞬态键剥离：copyRenderTree 把节点级 inserting 标记一并入史，实证造成重复入史与「撤销重做截断」
// （undoSeed.ts 文件头 ②），sanitizeTopHistory 在 back_forward 尾随剥除栈顶快照的该键。
import { describe, expect, test, vi } from 'vitest'
import { sanitizeTopHistory, seedUndoBaseline } from './undoSeed'
import type { MindMapHandle } from '../types/engine'

/** 最小假引擎：getData 返回固定树（快照源），command 面可注入栈态 */
const makeHandle = (history: string[], activeHistoryIndex = 0): MindMapHandle =>
  ({
    getData: () => ({ data: { text: '根', expand: true }, children: [] }),
    command: { history, activeHistoryIndex, originAddHistory: vi.fn() },
  }) as unknown as MindMapHandle

/** 引擎真实形状的插入快照：节点级 transient 键 inserting 与 data/children 并列（Render.insertChildNode） */
const insertSnapshot = JSON.stringify({
  data: { text: '根', expand: true },
  children: [{ inserting: true, data: { text: '二级节点' }, children: [] }],
})

describe('seedUndoBaseline（v1.1 撤销基线种子）', () => {
  test('空栈播基线：history 置为当前 getData 快照、指针归 0（首条编辑后可 BACK 回基线）', () => {
    const mm = makeHandle([])
    seedUndoBaseline(mm)
    expect(mm.command?.history).toEqual([JSON.stringify({ data: { text: '根', expand: true }, children: [] })])
    expect(mm.command?.activeHistoryIndex).toBe(0)
    // 直写零事件：不经 originAddHistory（其必发 data_change → 打开误置脏，见 undoSeed.ts 注释）
    expect(mm.command?.originAddHistory).not.toHaveBeenCalled()
  })

  test('幂等：栈非空不动（保存链再净化路径不重播基线、不截断用户历史）', () => {
    const mm = makeHandle(['基线', '编辑一'], 1)
    seedUndoBaseline(mm)
    expect(mm.command?.history).toEqual(['基线', '编辑一'])
    expect(mm.command?.activeHistoryIndex).toBe(1)
  })

  test('防御：无 command 面时静默跳过（不抛错）', () => {
    const mm = { getData: () => ({ data: { text: '根' }, children: [] }) } as unknown as MindMapHandle
    expect(() => seedUndoBaseline(mm)).not.toThrow()
  })

  test('基线含瞬态键时防御性剥除（打开路径理论上不会出现，守卫语义）', () => {
    const mm = {
      getData: () => ({ data: { text: '根' }, children: [{ inserting: true, data: { text: '子' }, children: [] }] }),
      command: { history: [] as string[], activeHistoryIndex: 0, originAddHistory: vi.fn() },
    } as unknown as MindMapHandle
    seedUndoBaseline(mm)
    const baseline = mm.command?.history[0]
    expect(baseline).toBeDefined()
    expect(baseline).not.toContain('"inserting"')
    expect(JSON.parse(baseline!).children[0].data.text).toBe('子')
  })
})

describe('sanitizeTopHistory（v1.1 瞬态键剥离）', () => {
  test('栈顶含 inserting：剥除节点级键，data 内容原样保留', () => {
    const mm = makeHandle(['基线', insertSnapshot], 1)
    sanitizeTopHistory(mm)
    const top = JSON.parse(mm.command!.history[1]!)
    expect(top.children[0].inserting).toBeUndefined()
    expect(top.children[0].data.text).toBe('二级节点')
    expect(mm.command?.activeHistoryIndex).toBe(1) // 只动栈顶字符串，指针不动
  })

  test('干净栈顶零改动（幂等，无 JSON 往返）', () => {
    const clean = JSON.stringify({ data: { text: '根' }, children: [{ data: { text: '子' }, children: [] }] })
    const mm = makeHandle([clean], 0)
    sanitizeTopHistory(mm)
    expect(mm.command?.history[0]).toBe(clean)
  })

  test('栈空/无 command 面：无害 no-op', () => {
    const empty = makeHandle([])
    expect(() => sanitizeTopHistory(empty)).not.toThrow()
    const bare = { getData: () => null } as unknown as MindMapHandle
    expect(() => sanitizeTopHistory(bare)).not.toThrow()
  })
})
