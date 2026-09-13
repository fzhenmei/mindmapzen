import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, test, vi } from 'vitest'
import { nodeIconsOf, useIconPicker } from './useIconPicker'
import type { MindMapHandle } from '../types/engine'

test('nodeIconsOf：剥 zen_ 前缀还原用户图标，排除状态徽章 zen_status-（看板互保）', () => {
  const mm = {
    getData: () => ({ data: { text: 'n', uid: 'u1', icon: ['zen_status-doing', 'zen_flag', 42] }, children: [] }),
  } as unknown as MindMapHandle
  expect(nodeIconsOf(mm, 'u1')).toEqual(['flag'])
  expect(nodeIconsOf(mm, null)).toEqual([])
})

test('useIconPicker.apply：覆写用户图标保留现有状态徽章（徽章互保协议）', () => {
  const execCommandIcon = vi.fn()
  const mm = {
    getData: () => ({ data: { text: 'n', uid: 'u1', icon: ['zen_status-doing', 'zen_flag'] }, children: [] }),
    // apply 落命令走渲染节点寻址（审查 Important-2）：渲染树命中即同步落
    renderer: { findNodeByUid: () => ({}) },
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>
  const onDataChanged = vi.fn()

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, onDataChanged))
  act(() => result.current.openPicker('n', ['flag']))
  act(() => result.current.apply(['star'], []))
  // 落下数组 = 现有徽章（zen_status- 原样置前）+ 本次所选用户图标
  expect(execCommandIcon).toHaveBeenCalledWith('u1', ['zen_status-doing', 'zen_star'])
  expect(onDataChanged).toHaveBeenCalledTimes(1)
})

test('useIconPicker.apply：无徽章节点覆写为纯用户图标（既有行为不回归）', () => {
  const execCommandIcon = vi.fn()
  const mm = {
    getData: () => ({ data: { text: 'n', uid: 'u1', icon: ['zen_flag'] }, children: [] }),
    renderer: { findNodeByUid: () => ({}) },
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, vi.fn()))
  act(() => result.current.openPicker('n', ['flag']))
  act(() => result.current.apply(['star'], []))
  expect(execCommandIcon).toHaveBeenCalledWith('u1', ['zen_star'])
})

test('useIconPicker.openPicker 显式 uid（看板桥接）：apply 落卡片节点而非画布选中；缺省仍取 uidRef', () => {
  // 看板卡片不是画布选中节点（Task 6 审查预警 A）：uidRef.current 是画布选中 u1，
  // 桥接传卡片 uid u2 —— apply 必须落 u2；不传 targetUid 时行为不变（落 u1）
  const execCommandIcon = vi.fn()
  const mm = {
    // 徽章读取路径的数据树（无 icon → 无徽章，断言只看落点 uid）
    getData: () => ({ data: { text: '根', uid: 'root' }, children: [] }),
    renderer: { findNodeByUid: () => ({}) },
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, vi.fn()))
  act(() => result.current.openPicker('卡片', [], 'u2'))
  act(() => result.current.apply(['star'], []))
  expect(execCommandIcon).toHaveBeenCalledWith('u2', ['zen_star'])
  execCommandIcon.mockClear()
  act(() => result.current.openPicker('画布选中', [])) // 缺省路径：快照画布选中 uid
  act(() => result.current.apply(['flag'], []))
  expect(execCommandIcon).toHaveBeenCalledWith('u1', ['zen_flag'])
})

test('useIconPicker.apply：收起分支卡片渲染树 miss → 展开祖先 + 渲染完成回调后落命令（审查 Important-2）', () => {
  // 树：root > grp(expand=false) > card(u2)。grp 收起时 card 不在渲染树——旧实现直接
  // execCommandIcon（内部 findNodeByUid 落空）静默 no-op 且误置脏；修复后先展开再落
  const card = { data: { text: '卡片', uid: 'u2', icon: ['zen_status-todo'] }, children: [] }
  const grp = { data: { text: '分组', uid: 'g', expand: false }, children: [card] }
  const root = { data: { text: '根', uid: 'r' }, children: [grp] }
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>()
  const execCommandIcon = vi.fn()
  const mm = {
    getData: () => root,
    on: (ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
    },
    off: vi.fn(),
    // grp 收起时渲染树不含 u2；展开（重渲完成）后可寻址。数据树挂 renderTree
    // （引擎活树形态——getData 是深拷贝副本，直写不落引擎）
    renderer: { renderTree: root, findNodeByUid: (uid: string): unknown => (uid === 'u2' && grp.data.expand !== false ? {} : null) },
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: null } as RefObject<string | null> // 画布无选中：纯桥接路径
  const onDataChanged = vi.fn()

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, onDataChanged))
  act(() => result.current.openPicker('卡片', [], 'u2'))
  act(() => result.current.apply(['star'], []))
  expect(grp.data.expand).toBe(true) // 祖先直写展开（视图导航豁免，不进 undo）
  expect(execCommandIcon).not.toHaveBeenCalled() // 命令不即刻落：等渲染完成回调
  expect(onDataChanged).not.toHaveBeenCalled() // 未落命令不置脏
  for (const cb of listeners.get('node_tree_render_end') ?? []) cb()
  // 徽章互保在延迟路径同样成立：zen_status-todo 置前 + 新选用户图标
  expect(execCommandIcon).toHaveBeenCalledWith('u2', ['zen_status-todo', 'zen_star'])
  expect(onDataChanged).toHaveBeenCalledTimes(1)
})
