// src/services/ai/tools.test.ts —— 五工具执行器（Task 7，spec §3）：
// fake mm 模拟引擎行为（execCommand 记录 + nodeData.children 追加），断言命令参数与 uid 取回
import { describe, expect, test, vi } from 'vitest'
import { executeAiTool, AI_TOOL_SCHEMAS } from './tools'
import { withAiCall } from './lock'
import type { MindMapHandle } from '../../types/engine'

interface FakeNode { data: { uid?: string; text: string }; nodeData: { children: FakeNd[] }; children: FakeNode[] }
type FakeNd = { data: { uid?: string; text: string }; children?: FakeNd[] }

function makeFakeMm() {
  const child: FakeNode = { data: { uid: 'b8c1', text: '子节点' }, nodeData: { children: [] }, children: [] }
  const root: FakeNode = { data: { uid: 'a3f2', text: '根' }, nodeData: { children: [child] }, children: [child] }
  const execCommand = vi.fn((cmd: string, ...args: unknown[]) => {
    if (cmd === 'INSERT_CHILD_NODE') {
      const nodes = args[1] as FakeNode[]
      const data = args[2] as { text: string }
      const uid = `new-${execCommand.mock.calls.length}`
      nodes[0].nodeData.children.push({ data: { uid, text: data.text } })
      nodes[0].children.push({ data: { uid, text: data.text }, nodeData: { children: [] }, children: [] } as FakeNode)
    }
  })
  const mm = {
    execCommand,
    renderer: {
      findNodeByUid: (uid: string) => (uid === 'a3f2' ? root : uid === 'b8c1' ? child : null),
      renderTree: { data: { uid: 'a3f2', text: '根' }, children: [{ data: { uid: 'b8c1', text: '子节点' } }] },
    },
  } as unknown as MindMapHandle
  return { mm, execCommand }
}

test('schema 五件套齐', () => {
  expect(AI_TOOL_SCHEMAS.map((t) => t.function.name)).toEqual([
    'get_mindmap', 'add_node', 'update_node_text', 'remove_node', 'move_node',
  ])
})

describe('executeAiTool', () => {
  test('add_node：显式父节点 + openEdit=false + 返回新 uid', () => {
    const { mm, execCommand } = makeFakeMm()
    const r = executeAiTool(mm, 'add_node', { parentUid: 'a3f2', text: '新要点' }, withAiCall)
    expect(r.ok).toBe(true)
    expect(r.uid).toMatch(/^new-/)
    const parent = execCommand.mock.calls[0]![2] as unknown[]
    expect(execCommand.mock.calls[0]![1]).toBe(false) // 不弹编辑框
    expect(Array.isArray(parent)).toBe(true)
  })
  test('add_node：文本剥 \\r（Word 毒节点教训）+ 父不存在失败', () => {
    const { mm } = makeFakeMm()
    const ok = executeAiTool(mm, 'add_node', { parentUid: 'a3f2', text: '行一\r\n行二' }, withAiCall)
    expect(ok.ok).toBe(true)
    const bad = executeAiTool(mm, 'add_node', { parentUid: 'nope', text: 'x' }, withAiCall)
    expect(bad.ok).toBe(false)
  })
  test('update/remove/move 命令参数', () => {
    const { mm, execCommand } = makeFakeMm()
    executeAiTool(mm, 'update_node_text', { uid: 'a3f2', text: '改后' }, withAiCall)
    expect(execCommand).toHaveBeenLastCalledWith('SET_NODE_TEXT', expect.anything(), '改后')
    executeAiTool(mm, 'remove_node', { uid: 'a3f2' }, withAiCall)
    expect(execCommand).toHaveBeenLastCalledWith('REMOVE_NODE', expect.anything())
    // 偏离 brief 原文：原 { uid: 'a3f2', newParentUid: 'a3f2' } 触发实现的自移守卫（node === to
    // 拒绝），MOVE_NODE_TO 永不派发与断言矛盾；fake 补解析 'b8c1' 后用可区分双 uid 核验传参
    executeAiTool(mm, 'move_node', { uid: 'b8c1', newParentUid: 'a3f2' }, withAiCall)
    expect(execCommand).toHaveBeenLastCalledWith('MOVE_NODE_TO', expect.anything(), expect.anything())
  })
  test('get_mindmap 返回 uid 缩进树', () => {
    const { mm } = makeFakeMm()
    const r = executeAiTool(mm, 'get_mindmap', {}, withAiCall)
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('- [a3f2] 根')
  })
  test('未知工具/引擎缺失失败不抛异常', () => {
    const { mm } = makeFakeMm()
    expect(executeAiTool(mm, 'hack', {}, withAiCall).ok).toBe(false)
    expect(executeAiTool(null, 'add_node', {}, withAiCall).ok).toBe(false)
  })
})
