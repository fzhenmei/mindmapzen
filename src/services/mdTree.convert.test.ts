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

  test('正文镜像 note(2026-09-06 合并)：zenToEngineTree 对有 body 节点同值产出 data.note', () => {
    const tree: ZenNode = { text: 'r', body: '论述。', children: [{ text: 'c', body: '引用\n> 行', children: [] }, { text: '无', children: [] }] }
    const eng = zenToEngineTree(tree)
    expect(eng.data.body).toBe('论述。')
    expect(eng.data.note).toBe('论述。') // 镜像:引擎角标/悬停由它驱动
    expect(eng.children![0]?.data.note).toBe('引用\n> 行')
    expect('note' in (eng.children![1]!.data)).toBe(false) // 无 body 不设键
  })

  test('zen_body 退役(2026-09-06 合并):有正文节点 data.icon 为纯用户图标,角标走镜像 note', () => {
    const tree: ZenNode = { text: 'r', body: '论述。', icons: ['flag'], children: [{ text: 'c', body: '子论述。', children: [] }] }
    const eng = zenToEngineTree(tree)
    expect(eng.data.icon).toEqual(['zen_flag']) // 不再追加 zen_body
    expect(eng.children![0]?.data.icon).toBeUndefined()
    expect(eng.data.note).toBe('论述。') // 角标/悬停由镜像驱动(Task 1)
    const back = engineTreeToZen(eng)
    expect(back.tree.icons).toEqual(['flag'])
  })

  test('正文空串口径：body 为空串时视为无正文（不挂角标、不设 data.body）', async () => {
    const { zenToEngineTree, engineTreeToZen } = await import('./mdTree')
    const tree: ZenNode = { text: 'r', body: '', children: [] }
    const engine = zenToEngineTree(tree)
    expect(engine.data.body).toBeUndefined()
    expect(engine.data.icon).toBeUndefined()
    expect(engineTreeToZen(engine).tree.body).toBeUndefined()
  })

  test('用户手敲 ::body 退役后按普通用户图标直通（无注入即无去重，roundtrip 恒等）', () => {
    const tree: ZenNode = { text: 'r', icons: ['body'], body: '论述。', children: [] }
    const eng = zenToEngineTree(tree)
    expect(eng.data.icon).toEqual(['zen_body']) // 用户 icons 直 map，不追加不补角标
    expect(engineTreeToZen(eng).tree.icons).toEqual(['body']) // zen_ 前缀全收，不再剥除保留名
  })

  test('engineTreeToZen 忽略镜像 data.note,只收 data.body', () => {
    const eng: EngineNode = { data: { text: 'r', body: '正文', note: '正文' }, children: [] }
    const back = engineTreeToZen(eng)
    expect(back.tree.body).toBe('正文')
    expect('note' in back.tree).toBe(false)
    // 纯镜像无 body(不应出现的形态)也不误收
    const lone: EngineNode = { data: { text: 'x', note: '孤儿' }, children: [] }
    expect('note' in engineTreeToZen(lone).tree).toBe(false)
    expect(engineTreeToZen(lone).tree.body).toBeUndefined()
    // data.note 非字符串(引擎他源写入)同样忽略
    const weird: EngineNode = { data: { text: 'y', note: 42 }, children: [] }
    expect('note' in engineTreeToZen(weird).tree).toBe(false)
  })
})

describe('状态徽章承载（看板模式）', () => {
  test('zenToEngineTree：status → data.icon 首项 zen_status_<s>，用户图标排后', () => {
    const eng = zenToEngineTree({ text: 'A', children: [], icons: ['flag'], status: 'doing' })
    expect(eng.data.icon).toEqual(['zen_status_doing', 'zen_flag'])
  })
  test('engineTreeToZen：徽章还原 status 字段，collectIcons 排除保留名', () => {
    const back = engineTreeToZen({ data: { text: 'A', icon: ['zen_status_done', 'zen_star'] }, children: [] })
    expect(back.tree.status).toBe('done')
    expect(back.tree.icons).toEqual(['star'])
  })
  test('非白名单徽章（zen_status_foo）宽容丢弃；无徽章不设 status', () => {
    const back = engineTreeToZen({ data: { text: 'A', icon: ['zen_status_foo'] }, children: [] })
    expect(back.tree.status).toBeUndefined()
    // 排除保留名后无用户图标 → 空集合不设键（项目既有不变量，与 body/tags/status 同口径）
    expect(back.tree.icons).toBeUndefined()
  })
})
