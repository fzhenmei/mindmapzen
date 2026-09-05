import { describe, expect, it, vi } from 'vitest'
import { collectUncuratedIcons, CURATED_ICONS, registerIconsInto, safeReRender, toEngineIconList } from './zenIcons'
import type { EngineNode } from '../types/engine'

/** 最小引擎树构造：children 递归展开 [data, ...children] 对 */
const tree = (data: EngineNode['data'], ...children: EngineNode[]): EngineNode => ({
  data,
  children,
})

describe('collectUncuratedIcons（打开期图标恢复，2026-09 修复：重开导图后非精选图标丢注册）', () => {
  it('整树收集非精选 zen_ 名（保序去重）；精选 / 非 zen_ 前缀 / 非字符串 / 非数组全忽略', () => {
    const root = tree(
      { text: '根', icon: ['zen_shield-alert', 'zen_flag', 'zen_book-search'] },
      tree({ text: '子1', icon: ['zen_shield-alert', 'zen_priority', 'emoji_smile'] } as EngineNode['data']),
      tree({ text: '子2', icon: 'zen_oops' } as unknown as EngineNode['data']),
      tree({ text: '子3' }),
    )
    expect(collectUncuratedIcons(root)).toEqual(['shield-alert', 'book-search', 'priority'])
  })

  // 内部保留名 body（2026-09 正文角标，Task 4 遗留 M-3）：静态在册不回收——
  // 若被收集，打开期会为它发起 lucide 全集加载（白拉 icon-nodes.json chunk 且名字不存在被丢弃）
  it('内部保留名 body 不进收集（静态在册，不走补注册）', () => {
    const root = tree(
      { text: '根', icon: ['zen_body', 'zen_flag'] },
      tree({ text: '子', icon: ['zen_body', 'zen_shield-alert'] } as EngineNode['data']),
    )
    expect(collectUncuratedIcons(root)).toEqual(['shield-alert']) // zen_body 被跳过
  })

  it('无图标 / 空树恒空数组', () => {
    expect(collectUncuratedIcons(tree({ text: 'a' }))).toEqual([])
    expect(collectUncuratedIcons(tree({ text: 'a' }, tree({ text: 'b' })))).toEqual([])
  })
})

describe('registerIconsInto（iconList 补注册：新名入册，已知/加载失败跳过）', () => {
  const list = () => [{ name: 'flag', icon: '<svg/>' }]

  it('新名按序注册并返回新增数；精选已在列表则不重复', async () => {
    const target = list()
    const loader = vi.fn(async (n: string) => `<svg data-name="${n}"/>`)
    const added = await registerIconsInto(target, ['shield-alert', 'flag', 'book-search'], loader)
    expect(added).toBe(2)
    expect(target.map((i) => i.name)).toEqual(['flag', 'shield-alert', 'book-search'])
    // 已在列表的名字不发起加载
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('loader 返回 null（名字不在 lucide 全集）宽容丢弃，不产生占位项', async () => {
    const target = list()
    const loader = vi.fn(async (n: string) => (n === 'shield-alert' ? '<svg/>' : null))
    const added = await registerIconsInto(target, ['shield-alert', 'not-exist'], loader)
    expect(added).toBe(1)
    expect(target).toHaveLength(2)
  })

  it('names 内重复名只注册一次', async () => {
    const target = list()
    const added = await registerIconsInto(target, ['a', 'a'], async () => '<svg/>')
    expect(added).toBe(1)
    expect(target).toHaveLength(2)
  })
})

describe('精选集健全性（用例前提）', () => {
  it('shield / search 在精选，shield-alert / book-search 不在（Bug 实案形态）', () => {
    expect(CURATED_ICONS['shield']).toBeDefined()
    expect(CURATED_ICONS['search']).toBeDefined()
    expect(CURATED_ICONS['shield-alert']).toBeUndefined()
    expect(CURATED_ICONS['book-search']).toBeUndefined()
  })

  it('内部保留名 body 不在精选集，但恰一次进引擎 iconList（角标静态在册）', () => {
    expect(CURATED_ICONS['body']).toBeUndefined() // 图标管理器网格不露出
    const list = toEngineIconList()
    expect(list).toHaveLength(1)
    expect(list[0]!.type).toBe('zen')
    const bodies = list[0]!.list.filter((i) => i.name === 'body')
    expect(bodies).toHaveLength(1) // 恰一次：精选与内部表重名会渲染重复角标
    expect(bodies[0]!.icon).toMatch(/^<svg/) // 已剥许可头，走引擎 SVG 分支
  })
})

describe('safeReRender（2026-09 双树错乱修复：渲染进行中的裸 reRender 致新旧两份完整树并存）', () => {
  /** 最小事件源测试替身：记录订阅，fire 手动派发 */
  const makeTarget = (isRendering: boolean) => {
    const subs = new Map<string, Array<() => void>>()
    const reRender = vi.fn()
    return {
      renderer: { isRendering },
      reRender,
      on: (ev: string, cb: () => void) => {
        subs.set(ev, [...(subs.get(ev) ?? []), cb])
      },
      off: (ev: string, cb: () => void) => {
        subs.set(ev, (subs.get(ev) ?? []).filter((f) => f !== cb))
      },
      fire: (ev: string) => {
        ;(subs.get(ev) ?? []).forEach((cb) => cb())
      },
    }
  }

  it('空闲（isRendering=false）直接 reRender，不挂任何事件', () => {
    const t = makeTarget(false)
    safeReRender(t)
    expect(t.reRender).toHaveBeenCalledTimes(1)
    t.fire('node_tree_render_end')
    expect(t.reRender).toHaveBeenCalledTimes(1) // 无残留订阅重复触发
  })

  it('渲染中（isRendering=true）挂 node_tree_render_end 延后调用；一次性退订防重复', () => {
    const t = makeTarget(true)
    safeReRender(t)
    expect(t.reRender).not.toHaveBeenCalled() // 关键:渲染中绝不立即调
    t.fire('node_tree_render_end')
    expect(t.reRender).toHaveBeenCalledTimes(1)
    t.fire('node_tree_render_end') // 二次 end(后续编辑等)不再触发
    expect(t.reRender).toHaveBeenCalledTimes(1)
  })
})
