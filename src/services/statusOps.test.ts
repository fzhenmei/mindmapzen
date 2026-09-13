import { describe, expect, test, vi } from 'vitest'
import { execOnRenderNode, expandToUid, findUidByPathText, mergeStatusBadge, nodeStatusOf } from './statusOps'
import type { MindMapHandle } from '../types/engine'

describe('statusOps（徽章互保协议）', () => {
  test('mergeStatusBadge：换状态保留用户图标、徽章恒居首；清除只滤徽章', () => {
    expect(mergeStatusBadge(['zen_status-todo', 'zen_flag'], 'doing')).toEqual(['zen_status-doing', 'zen_flag'])
    expect(mergeStatusBadge(['zen_status-todo', 'zen_flag'], null)).toEqual(['zen_flag'])
    expect(mergeStatusBadge(undefined, 'todo')).toEqual(['zen_status-todo'])
    // 非字符串项滤除（icon 数组里引擎杂质不保留）
    expect(mergeStatusBadge([42, 'zen_flag'], 'done')).toEqual(['zen_status-done', 'zen_flag'])
    // 旧徽章（含白名单外）一律滤除，由目标状态重新合成——不残留旧状态
    expect(mergeStatusBadge(['zen_status-weird', 'zen_flag'], 'todo')).toEqual(['zen_status-todo', 'zen_flag'])
  })
  test('nodeStatusOf：读引擎节点徽章还原状态；无徽章 null；白名单外 null', () => {
    const mm = {
      getData: () => ({
        data: { text: 'r', uid: 'r' },
        children: [{ data: { text: 'a', uid: 'a1', icon: ['zen_status-doing', 'zen_x'] }, children: [] }],
      }),
    } as unknown as MindMapHandle
    expect(nodeStatusOf(mm, 'a1')).toBe('doing')
    expect(nodeStatusOf(mm, 'r')).toBeNull()
    expect(nodeStatusOf(null, 'a1')).toBeNull()
    // 首个徽章白名单外 → null（与 mdTree engineTreeToZen 宽容丢弃口径一致）
    const weird = {
      getData: () => ({ data: { text: 'w', uid: 'w1', icon: ['zen_status-nope'] }, children: [] }),
    } as unknown as MindMapHandle
    expect(nodeStatusOf(weird, 'w1')).toBeNull()
  })

  test('expandToUid：收起祖先链直写展开并触发 safeReRender；目标自身 expand 不动', () => {
    // 树：root > a(expand=false) > b(展开) > t；a 收起、b 与 t 均展开。
    // 数据树挂 renderer.renderTree（引擎活树形态——getData 是深拷贝副本，直写不落引擎）
    const t = { data: { text: 't', uid: 't1', expand: true }, children: [] }
    const b = { data: { text: 'b', uid: 'b1', expand: true }, children: [t] }
    const a = { data: { text: 'a', uid: 'a1', expand: false }, children: [b] }
    const root = { data: { text: 'r', uid: 'r1' }, children: [a] }
    const reRender = vi.fn()
    const mm = { getData: () => root, reRender, on: vi.fn(), off: vi.fn(), renderer: { renderTree: root } } as unknown as MindMapHandle
    expect(expandToUid(mm, 't1')).toBe(true)
    expect(a.data.expand).toBe(true)
    // 已展开的祖先与目标自身的 expand 不被触碰（b 仍 true，t 目标无改写需求）
    expect(b.data.expand).toBe(true)
    expect(reRender).toHaveBeenCalledTimes(1)
  })

  test('expandToUid：路径已全展开/数据树未命中返回 false 且不触发重渲', () => {
    const leaf = { data: { text: 'x', uid: 'x1' }, children: [] }
    const root = { data: { text: 'r', uid: 'r1' }, children: [leaf] }
    const reRender = vi.fn()
    const mm = { getData: () => root, reRender, on: vi.fn(), off: vi.fn(), renderer: { renderTree: root } } as unknown as MindMapHandle
    expect(expandToUid(mm, 'x1')).toBe(false)
    expect(expandToUid(mm, 'ghost')).toBe(false)
    expect(reRender).not.toHaveBeenCalled()
  })

  test('execOnRenderNode：同收起分支同步两连操作——第二张等待渲染而非误判垃圾 uid（2026-09 批量归档遗留卡回归）', () => {
    // 树：root > g(expand=false) > d1,d2；渲染树随 renderDone 翻转（重渲完成才可寻址）
    const apply1 = vi.fn()
    const apply2 = vi.fn()
    const d1 = { data: { uid: 'd1' }, children: [] }
    const d2 = { data: { uid: 'd2' }, children: [] }
    const g = { data: { uid: 'g', expand: false }, children: [d1, d2] }
    const root = { data: { uid: 'r' }, children: [g] }
    const listeners = new Map<string, Array<() => void>>()
    let renderDone = false
    const mm = {
      getData: () => root,
      on: vi.fn((ev: string, cb: () => void) => {
        listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
      }),
      off: vi.fn((ev: string, cb: () => void) => {
        listeners.set(ev, (listeners.get(ev) ?? []).filter((f) => f !== cb))
      }),
      renderer: {
        renderTree: root,
        findNodeByUid: (uid: string) => {
          if (uid === 'r') return root
          if (uid === 'g') return g
          if (renderDone && uid === 'd1') return d1
          if (renderDone && uid === 'd2') return d2
          return null
        },
      },
    } as unknown as MindMapHandle
    // 批量同步两连（archiveAllDone 的 forEach 形态）：d1 触发展开挂回调；d2 祖先已被
    // d1 展开、重渲未完成——须同样挂回调等待，不得按垃圾 uid 丢弃命令
    execOnRenderNode(mm, 'd1', '改状态', apply1)
    execOnRenderNode(mm, 'd2', '改状态', apply2)
    expect(g.data.expand).toBe(true)
    expect(apply1).not.toHaveBeenCalled()
    expect(apply2).not.toHaveBeenCalled()
    renderDone = true
    for (const cb of [...(listeners.get('node_tree_render_end') ?? [])]) cb()
    expect(apply1).toHaveBeenCalledWith(d1)
    expect(apply2).toHaveBeenCalledWith(d2)
  })

  test('execOnRenderNode：数据树无此节点仍报错丢弃（垃圾 uid 出口不回归）', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const apply = vi.fn()
    const root = { data: { uid: 'r' }, children: [] }
    const mm = {
      getData: () => root,
      on: vi.fn(),
      off: vi.fn(),
      renderer: { renderTree: root, findNodeByUid: () => null },
    } as unknown as MindMapHandle
    execOnRenderNode(mm, 'ghost', '改状态', apply)
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('数据树中无此节点'), 'ghost')
    expect(apply).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('findUidByPathText（工作台跨图定位文本寻址，spec §5）', () => {
  // 引擎树形态（data.text/data.uid + children，与 getData()/renderTree 同构——调用侧
  // 入参是 mm.getData() 全量快照；brief 原夹具为 ZenNode 顶层形态，与调用点不符，此处
  // 按引擎形态落笔，三断言语义不变）：两「分支」下各一「任务甲」+ 根下直挂一「任务甲」
  const tree = {
    data: { text: '根', uid: 'r' },
    children: [
      { data: { text: '分支', uid: 'b' }, children: [{ data: { text: '任务甲', uid: 't1' }, children: [] }] },
      { data: { text: '分支', uid: 'b2' }, children: [{ data: { text: '任务甲', uid: 't2' }, children: [] }] },
      { data: { text: '任务甲', uid: 't3' }, children: [] },
    ],
  }
  test('path+text 命中：同父链同文本取 DFS 首个', () => {
    expect(findUidByPathText(tree, ['分支'], '任务甲')).toBe('t1')
  })
  test('空 path（未分组直挂根）：命中根下同名节点', () => {
    expect(findUidByPathText(tree, [], '任务甲')).toBe('t3')
  })
  test('miss 返回 null（图被外部改动）', () => {
    expect(findUidByPathText(tree, ['不存在'], '任务甲')).toBeNull()
  })
})
