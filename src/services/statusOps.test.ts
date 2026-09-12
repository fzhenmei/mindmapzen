import { describe, expect, test, vi } from 'vitest'
import { expandToUid, mergeStatusBadge, nodeStatusOf } from './statusOps'
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
    // 树：root > a(expand=false) > b(展开) > t；a 收起、b 与 t 均展开
    const t = { data: { text: 't', uid: 't1', expand: true }, children: [] }
    const b = { data: { text: 'b', uid: 'b1', expand: true }, children: [t] }
    const a = { data: { text: 'a', uid: 'a1', expand: false }, children: [b] }
    const root = { data: { text: 'r', uid: 'r1' }, children: [a] }
    const reRender = vi.fn()
    const mm = { getData: () => root, reRender, on: vi.fn(), off: vi.fn() } as unknown as MindMapHandle
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
    const mm = { getData: () => root, reRender, on: vi.fn(), off: vi.fn() } as unknown as MindMapHandle
    expect(expandToUid(mm, 'x1')).toBe(false)
    expect(expandToUid(mm, 'ghost')).toBe(false)
    expect(reRender).not.toHaveBeenCalled()
  })
})
