// src/hooks/useTagPicker.test.ts —— 标签选择器状态与应用（与 useIconPicker.test 同构）：
// 缺省路径快照画布选中 uid（既有行为）；显式 targetUid 落卡片节点（看板桥接，
// Task 6 审查预警 A——看板卡片不是画布选中节点，桥接必须显式寻址）；收起分支卡片
// 经展开 + 渲染完成回调落命令（审查 Important-2）
import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, test, vi } from 'vitest'
import { useTagPicker } from './useTagPicker'
import type { MindMapHandle } from '../types/engine'

const makeMm = () => {
  const execCommandTag = vi.fn()
  const mm = {
    getData: () => ({ data: { text: '根', uid: 'root' }, children: [] }),
    // apply 落命令走渲染节点寻址（审查 Important-2）：渲染树命中即同步落
    renderer: { findNodeByUid: () => ({}) },
    execCommandTag,
  } as unknown as MindMapHandle
  return { mm, execCommandTag }
}

test('useTagPicker：缺省路径 apply 落画布选中 uid（uidRef 快照）', () => {
  const { mm, execCommandTag } = makeMm()
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>

  const { result } = renderHook(() => useTagPicker(mmRef, uidRef, vi.fn()))
  act(() => result.current.openPicker('n', ['urgent'], ['urgent']))
  act(() => result.current.apply(['urgent', '采购']))
  expect(execCommandTag).toHaveBeenCalledWith('u1', ['urgent', '采购'])
})

test('useTagPicker.openPicker 显式 uid（看板桥接）：apply 落卡片节点而非画布选中', () => {
  const { mm, execCommandTag } = makeMm()
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>

  const { result } = renderHook(() => useTagPicker(mmRef, uidRef, vi.fn()))
  act(() => result.current.openPicker('卡片', [], [], 'u2'))
  act(() => result.current.apply(['采购']))
  expect(execCommandTag).toHaveBeenCalledWith('u2', ['采购'])
})

test('useTagPicker.apply：收起分支卡片渲染树 miss → 展开祖先 + 渲染完成回调后落命令（审查 Important-2）', () => {
  // 树：root > grp(expand=false) > card(u2)。旧实现直接 execCommandTag（内部
  // findNodeByUid 落空）静默 no-op 且误置脏；修复后先展开再于渲染完成回调落命令
  const card = { data: { text: '卡片', uid: 'u2', tag: ['urgent'] }, children: [] }
  const grp = { data: { text: '分组', uid: 'g', expand: false }, children: [card] }
  const root = { data: { text: '根', uid: 'r' }, children: [grp] }
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>()
  const execCommandTag = vi.fn()
  const mm = {
    getData: () => root,
    on: (ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(ev, [...(listeners.get(ev) ?? []), cb])
    },
    off: vi.fn(),
    // grp 收起时渲染树不含 u2；展开（重渲完成）后可寻址
    renderer: { findNodeByUid: (uid: string): unknown => (uid === 'u2' && grp.data.expand !== false ? {} : null) },
    execCommandTag,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: null } as RefObject<string | null> // 画布无选中：纯桥接路径
  const onDataChanged = vi.fn()

  const { result } = renderHook(() => useTagPicker(mmRef, uidRef, onDataChanged))
  act(() => result.current.openPicker('卡片', ['urgent'], [], 'u2'))
  act(() => result.current.apply(['urgent', '采购']))
  expect(grp.data.expand).toBe(true) // 祖先直写展开（视图导航豁免，不进 undo）
  expect(execCommandTag).not.toHaveBeenCalled() // 命令不即刻落：等渲染完成回调
  expect(onDataChanged).not.toHaveBeenCalled() // 未落命令不置脏
  for (const cb of listeners.get('node_tree_render_end') ?? []) cb()
  // 整组覆写在延迟路径同样成立：既有 urgent + 新增采购
  expect(execCommandTag).toHaveBeenCalledWith('u2', ['urgent', '采购'])
  expect(onDataChanged).toHaveBeenCalledTimes(1)
})
