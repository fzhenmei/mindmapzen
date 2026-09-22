// useNodeSearch(节点搜索状态源):openSearch 打开时拍全树快照(flattenNodeHits,含收起
// 隐藏子树——收起的节点也能搜到跳转);pick 组合定位链 = locate(宿主的切态+展开+居中)
// + execOnRenderNode 寻址落 SET_NODE_ACTIVE 激活高亮(渲染树 miss 时等重渲,收起分支
// 首跳不丢)。引擎不进单测:fake mm 手写 on/off + renderTree/findNodeByUid。
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import type { EngineNode, MindMapHandle } from '../types/engine'
import { useNodeSearch } from './useNodeSearch'

/** 树:根 > 甲(expand=false 收起,子树隐藏) > 任务A */
const tree: EngineNode = {
  data: { text: '根', uid: 'r' },
  children: [
    {
      data: { text: '甲', uid: 'a', expand: false },
      children: [{ data: { text: '任务A', uid: 't1' }, children: [] }],
    },
  ],
}

function fakeMm() {
  const execCommand = vi.fn()
  const renderNode = { uid: 't1' }
  const mm = {
    execCommand,
    on: vi.fn(),
    off: vi.fn(),
    renderer: {
      renderTree: tree,
      findNodeByUid: (uid: string) => (uid === 't1' ? renderNode : null),
    },
  } as unknown as MindMapHandle
  return { mm, execCommand, renderNode }
}

/** 渲染探针:hook 返回值存外部 ref,测试直接驱动 openSearch/pick 并读 open/hits */
function mount(mm: MindMapHandle | null, locate: (uid: string) => void): {
  openSearch(): void
  pick(uid: string): void
  get(): ReturnType<typeof useNodeSearch>
} {
  const box = { current: null as null | ReturnType<typeof useNodeSearch> }
  function Probe(): null {
    const mmRef = useRef<MindMapHandle | null>(mm)
    box.current = useNodeSearch({ mmRef, locate })
    return null
  }
  render(<Probe />)
  return {
    openSearch: () => act(() => box.current!.openSearch()),
    pick: (uid: string) => act(() => box.current!.pick(uid)),
    get: () => box.current!,
  }
}

afterEach(cleanup)

describe('useNodeSearch(节点搜索状态源)', () => {
  test('openSearch:拍全树快照(含收起隐藏子树)并开浮层;引擎缺失拍空列表', () => {
    const { mm } = fakeMm()
    const p = mount(mm, () => {})
    expect(p.get().open).toBe(false)
    p.openSearch()
    expect(p.get().open).toBe(true)
    expect(p.get().hits.map((h) => h.uid)).toEqual(['r', 'a', 't1'])
    // 引擎未就绪(mm null):防御性开空浮层(空态提示),不崩
    const p2 = mount(null, () => {})
    p2.openSearch()
    expect(p2.get().hits).toEqual([])
    expect(p2.get().open).toBe(true)
  })

  test('pick:locate 组合调用 + 渲染树命中落 SET_NODE_ACTIVE 激活高亮', () => {
    const { mm, execCommand, renderNode } = fakeMm()
    const located: string[] = []
    const p = mount(mm, (uid) => located.push(uid))
    p.pick('t1')
    expect(located).toEqual(['t1'])
    expect(execCommand).toHaveBeenCalledWith('SET_NODE_ACTIVE', renderNode, true)
  })

  test('close 关浮层(候选不重置也无妨——下次 openSearch 重拍)', () => {
    const { mm } = fakeMm()
    const p = mount(mm, () => {})
    p.openSearch()
    act(() => p.get().close())
    expect(p.get().open).toBe(false)
  })
})
