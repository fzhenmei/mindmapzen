// toolsCanvas.test.ts —— 新工具单测:get_node_detail 读全量数据树(收起分支可读);
// 其余写工具渲染树寻址、miss 显式拒绝。mock 同 tools.test.ts 形状。
import { describe, expect, test, vi } from 'vitest'
import { executeAiTool } from './tools'
import { withAiCall } from './lock'
import type { EngineNode } from '../../types/engine'

/** renderTree 上的数据形状节点 */
const dataNode = (uid: string, over: Record<string, unknown> = {}, children: EngineNode[] = []): EngineNode => ({
  data: { text: `t-${uid}`, uid, ...over },
  children,
})

const makeMm = (root: EngineNode) => {
  const execCommand = vi.fn()
  const findNodeByUid = vi.fn()
  const mm = {
    execCommand,
    getData: () => root,
    renderer: { renderTree: root, findNodeByUid },
  }
  return { mm: mm as unknown as Parameters<typeof executeAiTool>[0], execCommand, findNodeByUid }
}

describe('get_node_detail', () => {
  test('读正文/图标/标签全文;收起分支(渲染 miss)也可读', () => {
    const child = dataNode('c1', { body: '长正文\n第二行', icon: ['zen_flag'], tag: ['x'] })
    const root = dataNode('root', {}, [child])
    const { mm, findNodeByUid } = makeMm(root)
    findNodeByUid.mockReturnValue(null) // 渲染树 miss(收起)——读工具仍可用
    const r = executeAiTool(mm, 'get_node_detail', { uid: 'c1' }, withAiCall)
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('长正文\\n第二行')
    expect(r.detail).toContain('flag')
    expect(r.detail).toContain('"x"')
  })

  test('uid 不存在显式拒绝', () => {
    const { mm } = makeMm(dataNode('root'))
    const r = executeAiTool(mm, 'get_node_detail', { uid: 'nope' }, withAiCall)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('nope')
  })
})
