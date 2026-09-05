import { describe, expect, test } from 'vitest'
import { engineTreeToZen, zenToEngineTree } from './mdTree'
import type { ZenNode } from '../types/tree'
import type { EngineNode } from '../types/engine'

const n = (text: string, children: ZenNode[] = []): ZenNode => ({ text, children })

describe('zen ⇄ engine 转换', () => {
  test('zen→engine：默认展开', () => {
    expect(zenToEngineTree(n('根', [n('A')]))).toEqual({
      data: { text: '根', expand: true },
      children: [{ data: { text: 'A', expand: true }, children: [] }],
    })
  })

  test('zen→engine：折叠路径集合生效', () => {
    const tree = n('根', [n('A', [n('A1')])])
    const eng = zenToEngineTree(tree, new Set(['/根/A']))
    expect(eng.children![0].data.expand).toBe(false)
    expect(eng.children![0].children![0].data.expand).toBe(true) // 子节点仍默认展开
  })

  test('engine→zen：还原树并收集折叠路径（data.uid 透传进 ZenNode，M5d 序列化注入查表用）', () => {
    const eng: EngineNode = {
      data: { text: '根', expand: true },
      children: [{ data: { text: 'A', expand: false, uid: 'x' }, children: [{ data: { text: 'A1', expand: true }, children: [] }] }],
    }
    const r = engineTreeToZen(eng)
    expect(r.tree).toEqual({ text: '根', children: [{ text: 'A', uid: 'x', children: [{ text: 'A1', children: [] }] }] })
    expect(r.collapsed).toEqual(['/根/A'])
  })

  test('engine→zen：children 缺省按空处理；uid 非字符串不透传', () => {
    expect(engineTreeToZen({ data: { text: 'r' } }).tree).toEqual(n('r'))
    expect(engineTreeToZen({ data: { text: 'r', uid: 42 }, children: [] }).tree).toEqual(n('r'))
  })

  test('zen→engine：note 透传进 data（undefined 不设键）', () => {
    const eng = zenToEngineTree(n('根', [{ text: 'A', note: '备注', children: [] }]))
    expect(eng.children![0].data.note).toBe('备注')
    expect('note' in eng.data).toBe(false) // 根无 note：不设键而非 undefined 值
  })

  test('正文引擎通道：body 透传 data.body，zen_body 图标注入/剥除互逆（2026-09 写作）', async () => {
    const { zenToEngineTree, engineTreeToZen } = await import('./mdTree')
    const tree: ZenNode = {
      text: '根', body: '论述。', icons: ['flag'],
      children: [{ text: '子', body: '子论述。', children: [] }, { text: '无正文', children: [] }],
    }
    const engine = zenToEngineTree(tree)
    expect(engine.data.body).toBe('论述。')
    expect(engine.data.icon).toEqual(['zen_flag', 'zen_body']) // 用户图标之外尾部追加
    expect(engine.children?.[0]?.data.body).toBe('子论述。')
    expect(engine.children?.[1]?.data.body).toBeUndefined()
    expect(engine.children?.[1]?.data.icon).toBeUndefined() // 无正文不挂角标
    const back = engineTreeToZen(engine)
    expect(back.tree.body).toBe('论述。')
    expect(back.tree.icons).toEqual(['flag']) // zen_body 剥除，不进 md
    expect(back.tree.children[0]?.body).toBe('子论述。')
    // 端到端：收集后的树 serialize 不含 zen_body 痕迹（'::' 为用户 flag 图标的合法标记，
    // 整体断言不含 '::' 与同用例 icons 保留 ['flag'] 矛盾，改用精确泄漏形态 '::body'）
    const { serialize } = await import('./mdTree')
    expect(serialize(back.tree)).not.toContain('body')
    expect(serialize(back.tree)).not.toContain('::body')
  })

  test('正文空串口径：body 为空串时视为无正文（不挂角标、不设 data.body）', async () => {
    const { zenToEngineTree, engineTreeToZen } = await import('./mdTree')
    const tree: ZenNode = { text: 'r', body: '', children: [] }
    const engine = zenToEngineTree(tree)
    expect(engine.data.body).toBeUndefined()
    expect(engine.data.icon).toBeUndefined()
    expect(engineTreeToZen(engine).tree.body).toBeUndefined()
  })

  test('engine→zen：收集 data.note（仅字符串，其余视为无备注）', () => {
    const eng: EngineNode = {
      data: { text: '根' },
      children: [
        { data: { text: 'A', note: '备注' }, children: [] },
        { data: { text: 'B', note: 42 }, children: [] },
        { data: { text: 'C', note: undefined }, children: [] },
      ],
    }
    const r = engineTreeToZen(eng)
    expect(r.tree.children[0].note).toBe('备注')
    expect('note' in r.tree.children[1]).toBe(false)
    expect('note' in r.tree.children[2]).toBe(false)
  })
})
