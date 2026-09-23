// nodeSearch(节点搜索纯函数):flattenNodeHits 全树扁平化(含收起隐藏子树——数据树
// children 不因收起摘除)+ filterNodeHits 大小写不敏感子串过滤。跳转定位/高亮在
// useNodeSearch 组合,此处只管数据面。
import { describe, expect, test } from 'vitest'
import { filterNodeHits, flattenNodeHits, type NodeHit } from './nodeSearch'
import type { EngineNode } from '../types/engine'

// 树夹具:根 > 甲(收起,子树隐藏仍在数据树) > 任务A / 根 > 乙 > SpringBoot
const tree: EngineNode = {
  data: { text: '根主题', uid: 'r' },
  children: [
    {
      data: { text: '甲', uid: 'a', expand: false },
      children: [{ data: { text: '任务A', uid: 't1' }, children: [] }],
    },
    {
      data: { text: '乙', uid: 'b' },
      children: [{ data: { text: 'SpringBoot', uid: 's1' }, children: [] }],
    },
  ],
}

describe('flattenNodeHits(全树扁平化)', () => {
  test('DFS 收集全部节点(含收起子树):uid/text/path/depth', () => {
    const hits = flattenNodeHits(tree)
    expect(hits.map((h) => h.uid)).toEqual(['r', 'a', 't1', 'b', 's1'])
    const byUid = new Map(hits.map((h) => [h.uid, h]))
    expect(byUid.get('r')).toMatchObject({ text: '根主题', path: '', depth: 0 })
    expect(byUid.get('a')).toMatchObject({ text: '甲', path: '根主题', depth: 1 })
    expect(byUid.get('t1')).toMatchObject({ text: '任务A', path: '根主题 / 甲', depth: 2 })
    expect(byUid.get('s1')).toMatchObject({ text: 'SpringBoot', path: '根主题 / 乙', depth: 2 })
  })
  test('text/uid 非字符串的毒节点跳过自身、仍递归子树', () => {
    const dirty = {
      data: { text: '根', uid: 'r' },
      children: [
        { data: { uid: 42, text: '坏uid' }, children: [{ data: { text: '好孙', uid: 'g1' }, children: [] }] },
        { data: { uid: 'x1', text: 7 }, children: [] },
      ],
    } as unknown as EngineNode
    const hits = flattenNodeHits(dirty)
    expect(hits.map((h) => h.uid)).toEqual(['r', 'g1'])
  })
  test('空树返回空数组', () => {
    expect(flattenNodeHits(null)).toEqual([])
    expect(flattenNodeHits(undefined)).toEqual([])
  })
})

describe('filterNodeHits(过滤)', () => {
  const hits: NodeHit[] = flattenNodeHits(tree)
  test('大小写不敏感子串:英文大小写互通、中文子串命中', () => {
    expect(filterNodeHits(hits, 'spring').map((h) => h.uid)).toEqual(['s1'])
    expect(filterNodeHits(hits, '任务').map((h) => h.uid)).toEqual(['t1'])
    expect(filterNodeHits(hits, '甲').map((h) => h.uid)).toEqual(['a'])
  })
  test('空/纯空白 query 返回全量原序;无匹配返回空', () => {
    expect(filterNodeHits(hits, '')).toHaveLength(5)
    expect(filterNodeHits(hits, '   ')).toHaveLength(5)
    expect(filterNodeHits(hits, '不存在')).toEqual([])
  })
})
