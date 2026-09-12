import { describe, expect, test } from 'vitest'
import { buildKanbanCards, truncateCardSubtree } from './kanban'
import type { ZenNode } from '../types/tree'

describe('buildKanbanCards（树 → 卡片集）', () => {
  test('有 status 才进看板；未分组置顶、分支卡树序在后；path 是父链（不含根与自身）', () => {
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
    // 2026-09 看板治理 spec §3：未分组（收件箱）卡提前——列底新增挂根下不再沉底
    expect(cards[0]).toMatchObject({ uid: 't3', text: '根下直挂', status: 'todo', path: [] })
    expect(cards[1]).toMatchObject({ uid: 't1', text: '修滚动条', status: 'doing', path: ['引擎'] })
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

  // ---- 子树整体（2026-09 卡片携带子树）：childCount/outline 走截断口径 ----

  test('卡片携带无状态后代：childCount 计数、outline 为带层级的大纲行', () => {
    const root5 = {
      text: '根', uid: 'r', children: [
        { text: '任务A', uid: 'a', status: 'doing', children: [
          { text: '说明1', uid: 'a1', children: [
            { text: '深层', uid: 'a1a', children: [] },
          ] },
          { text: '说明2', uid: 'a2', children: [] },
        ] },
      ],
    }
    const card = buildKanbanCards(root5 as unknown as ZenNode)[0]
    expect(card.childCount).toBe(3)
    expect(card.outline).toEqual([
      { uid: 'a1', text: '说明1', depth: 0 }, { uid: 'a1a', text: '深层', depth: 1 }, { uid: 'a2', text: '说明2', depth: 0 },
    ])
  })

  test('无子孙卡片：childCount=0、outline 空数组', () => {
    const root6 = {
      text: '根', uid: 'r', children: [
        { text: '独卡', uid: 't', status: 'todo', children: [] },
      ],
    }
    const card = buildKanbanCards(root6 as unknown as ZenNode)[0]
    expect(card.childCount).toBe(0)
    expect(card.outline).toEqual([])
  })

  test('截断：带状态后代不入父卡（其后代同不入），自身独立成卡', () => {
    // 树：根 > 任务A(doing) > [子任务B(todo) > B1, 说明C]
    const root7 = {
      text: '根', uid: 'r', children: [
        { text: '任务A', uid: 'a', status: 'doing', children: [
          { text: '子任务B', uid: 'b', status: 'todo', children: [
            { text: 'B1', uid: 'b1', children: [] },
          ] },
          { text: '说明C', uid: 'c', children: [] },
        ] },
      ],
    }
    const cards = buildKanbanCards(root7 as unknown as ZenNode)
    expect(cards).toHaveLength(2)
    // 父卡截断在子任务B处：只含说明C；B1 属 B 卡范围，同不入 A
    const [a, b] = cards
    expect(a).toMatchObject({ uid: 'a', childCount: 1, outline: [{ uid: 'c', text: '说明C', depth: 0 }] })
    // 子任务B独立成卡，其无状态后代入 B 卡
    expect(b).toMatchObject({ uid: 'b', status: 'todo', childCount: 1, outline: [{ uid: 'b1', text: 'B1', depth: 0 }] })
  })

  test('未分组置顶（2026-09 看板治理）：收件箱卡列内最前，分支卡按树序聚集其后', () => {
    const root = {
      text: '项目', uid: 'r', children: [
        { text: '分支甲', uid: 'b1', children: [
          { text: '甲任务1', uid: 'bt1', status: 'done', children: [] },
          { text: '甲任务2', uid: 'bt2', status: 'done', children: [] },
        ] },
        { text: '收件箱老任务', uid: 'inbox1', status: 'done', children: [] },
        { text: '分支乙', uid: 'b2', children: [
          { text: '乙任务', uid: 'bt3', status: 'done', children: [] },
        ] },
        { text: '收件箱新任务', uid: 'inbox2', status: 'done', children: [] },
      ],
    }
    const cards = buildKanbanCards(root as unknown as ZenNode)
    // 全部 done 同列：收件箱两张置前（树序），分支卡按 DFS 树序在后（同分支聚集）
    expect(cards.map((c) => c.uid)).toEqual(['inbox1', 'inbox2', 'bt1', 'bt2', 'bt3'])
  })
})

describe('truncateCardSubtree（卡片复制范围剪枝）', () => {
  test('带 status 后代连同其后代整枝剪掉，返回原引用便于链式；无状态层全保留', () => {
    const tree = {
      text: '任务A', uid: 'a', status: 'doing', children: [
        { text: '子任务B', uid: 'b', status: 'todo', children: [
          { text: 'B1', uid: 'b1', children: [] },
        ] },
        { text: '说明C', uid: 'c', children: [
          { text: '深层', uid: 'c1', children: [] },
        ] },
      ],
    }
    const out = truncateCardSubtree(tree as unknown as ZenNode)
    expect(out).toBe(tree) // 原地剪枝返回原引用（fresh 树零拷贝）
    expect(out.children).toEqual([
      { text: '说明C', uid: 'c', children: [{ text: '深层', uid: 'c1', children: [] }] },
    ])
  })
})
