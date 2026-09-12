// src/hooks/useTagPicker.test.ts —— 标签选择器状态与应用（与 useIconPicker.test 同构）：
// 缺省路径快照画布选中 uid（既有行为）；显式 targetUid 落卡片节点（看板桥接，
// Task 6 审查预警 A——看板卡片不是画布选中节点，桥接必须显式寻址）
import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, test, vi } from 'vitest'
import { useTagPicker } from './useTagPicker'
import type { MindMapHandle } from '../types/engine'

const makeMm = () => {
  const execCommandTag = vi.fn()
  const mm = {
    getData: () => ({ data: { text: '根', uid: 'root' }, children: [] }),
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
