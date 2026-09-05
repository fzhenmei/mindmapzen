// src/editor/canvasPaste.test.ts —— 画布态文本粘贴分派（宿主接管 Control+v 后的引擎语义复刻）：
// smm 格式（画布内复制/剪切节点写入的 JSON）→ INSERT_MULTI_CHILD_NODE 还原节点；
// 普通文本 → INSERT_CHILD_NODE 建子节点。只复刻「分派」，插入语义由引擎命令本体保证。
import { expect, test, vi } from 'vitest'
import { pasteTextToCanvas } from './canvasPaste'
import type { MindMapHandle } from '../types/engine'

/** 最小引擎句柄：只记录 execCommand 调用 */
function mmOf(): { mm: MindMapHandle; execCommand: ReturnType<typeof vi.fn> } {
  const execCommand = vi.fn()
  return { mm: { execCommand } as unknown as MindMapHandle, execCommand }
}

test('smm 格式（对象 data）→ INSERT_MULTI_CHILD_NODE 单元素数组还原', () => {
  const { mm, execCommand } = mmOf()
  const nodeData = { data: { text: '复制的节点' }, children: [] }
  pasteTextToCanvas(mm, JSON.stringify({ simpleMindMap: true, data: nodeData }))
  expect(execCommand).toHaveBeenCalledExactlyOnceWith('INSERT_MULTI_CHILD_NODE', [], [nodeData])
})

test('smm 格式（数组 data，多节点复制）→ 数组直通', () => {
  const { mm, execCommand } = mmOf()
  const list = [
    { data: { text: '甲' }, children: [] },
    { data: { text: '乙' }, children: [] },
  ]
  pasteTextToCanvas(mm, JSON.stringify({ simpleMindMap: true, data: list }))
  expect(execCommand).toHaveBeenCalledExactlyOnceWith('INSERT_MULTI_CHILD_NODE', [], list)
})

test('普通文本 → INSERT_CHILD_NODE 整段单节点（引擎现状：未配拆行 opt）', () => {
  const { mm, execCommand } = mmOf()
  pasteTextToCanvas(mm, '外部复制的一段文字')
  expect(execCommand).toHaveBeenCalledExactlyOnceWith('INSERT_CHILD_NODE', false, [], { text: '外部复制的一段文字' })
})

test('多行普通文本 → 整段进单节点（不拆行，与引擎 paste 现状一致）', () => {
  const { mm, execCommand } = mmOf()
  pasteTextToCanvas(mm, '第一行\n第二行')
  expect(execCommand).toHaveBeenCalledExactlyOnceWith('INSERT_CHILD_NODE', false, [], { text: '第一行\n第二行' })
})

test('非 JSON 乱串（parse 失败宽容）→ 按普通文本建子节点', () => {
  const { mm, execCommand } = mmOf()
  pasteTextToCanvas(mm, '{不是合法 JSON')
  expect(execCommand).toHaveBeenCalledExactlyOnceWith('INSERT_CHILD_NODE', false, [], { text: '{不是合法 JSON' })
})

test('空文本 → no-op（不调命令，同引擎 paste 的 if (text) 守卫）', () => {
  const { mm, execCommand } = mmOf()
  pasteTextToCanvas(mm, '')
  expect(execCommand).not.toHaveBeenCalled()
})
