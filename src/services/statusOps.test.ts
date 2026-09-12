import { describe, expect, test } from 'vitest'
import { mergeStatusBadge, nodeStatusOf } from './statusOps'
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
    expect(nodeStatusOf(mm, 'r')).toBe(null)
    expect(nodeStatusOf(null, 'a1')).toBe(null)
    // 首个徽章白名单外 → null（与 mdTree engineTreeToZen 宽容丢弃口径一致）
    const weird = {
      getData: () => ({ data: { text: 'w', uid: 'w1', icon: ['zen_status-nope'] }, children: [] }),
    } as unknown as MindMapHandle
    expect(nodeStatusOf(weird, 'w1')).toBe(null)
  })
})
