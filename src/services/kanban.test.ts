import { describe, expect, test } from 'vitest'
import { buildKanbanCards } from './kanban'
import type { ZenNode } from '../types/tree'

describe('buildKanbanCards（树 → 卡片集）', () => {
  test('有 status 才进看板；树序输出；path 是父链（不含根与自身）', () => {
    const root = {
      text: '项目', uid: 'r', children: [
        { text: '引擎', uid: 'e', children: [
          { text: '修滚动条', uid: 't1', status: 'doing', children: [] },
          { text: '说明节点', uid: 't2', children: [] },
        ] },
        { text: '根下直挂', uid: 't3', status: 'todo', children: [] },
      ],
    }
    const cards = buildKanbanCards(root as unknown as ZenNode)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ uid: 't1', text: '修滚动条', status: 'doing', path: ['引擎'] })
    expect(cards[1]).toMatchObject({ uid: 't3', text: '根下直挂', status: 'todo', path: [] })
  })

  test('卡片携带 icons/tags/hasBody；根节点自身带 status 也进（中心主题可为任务）', () => {
    const root2 = { text: '根', uid: 'r', status: 'done', body: 'x', icons: ['flag'], children: [] }
    expect(buildKanbanCards(root2 as unknown as ZenNode)[0]).toMatchObject({ uid: 'r', status: 'done', hasBody: true, icons: ['flag'], path: [] })
  })

  // Task 5 审查缺口回填（Task 6 顺手加固）：uid 是看板操作寻址面——无 uid 的 status
  // 节点无操作能力，不进卡（引擎侧 uid 恒存在，此为防御口径）
  test('缺 uid 的 status 节点不进卡', () => {
    const root3 = {
      text: '根', uid: 'r', children: [
        { text: '无 uid 任务', status: 'todo', children: [] },
      ],
    }
    expect(buildKanbanCards(root3 as unknown as ZenNode)).toHaveLength(0)
  })

  test('深层任务 path 为多元素父链；tags 缺省兜底空数组；hasBody 空串与缺省均 false', () => {
    const root4 = {
      text: '根', uid: 'r', children: [
        { text: 'A', uid: 'a', children: [
          { text: 'B', uid: 'b', children: [
            { text: '空串正文', uid: 't9', status: 'blocked', body: '', children: [] },
            { text: '无正文', uid: 't10', status: 'todo', children: [] },
          ] },
        ] },
      ],
    }
    const cards = buildKanbanCards(root4 as unknown as ZenNode)
    expect(cards[0]).toMatchObject({ uid: 't9', path: ['A', 'B'], tags: [], hasBody: false })
    expect(cards[1]).toMatchObject({ uid: 't10', path: ['A', 'B'], tags: [], hasBody: false })
  })
})
