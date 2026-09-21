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
  return { mm: mm as unknown as NonNullable<Parameters<typeof executeAiTool>[0]>, execCommand, findNodeByUid }
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

describe('set_node_body', () => {
  test('成对写 body+note,空串=undefined 清空;角标刷新被调', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, execCommand, findNodeByUid } = makeMm(root)
    const inst = { getData: (k: string) => (k === 'body' ? '旧' : undefined) }
    findNodeByUid.mockReturnValue(inst)
    mm.renderer!.reRenderNodeCheckChange = vi.fn()
    const r = executeAiTool(mm, 'set_node_body', { uid: 'c1', text: '新正文' }, (fn) => fn())
    expect(r.ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('SET_NODE_DATA', inst, { body: '新正文', note: '新正文' })
    expect(mm.renderer!.reRenderNodeCheckChange).toHaveBeenCalledWith(inst)
  })

  test('空串清空(body/note 同 undefined,useBodyDialog 同口径)', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, execCommand, findNodeByUid } = makeMm(root)
    findNodeByUid.mockReturnValue({})
    executeAiTool(mm, 'set_node_body', { uid: 'c1', text: '' }, (fn) => fn())
    expect(execCommand).toHaveBeenCalledWith('SET_NODE_DATA', expect.anything(), { body: undefined, note: undefined })
  })

  test('正文保留空行与行尾空白(markdown 段落语义),仅剥 \\r', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, execCommand, findNodeByUid } = makeMm(root)
    findNodeByUid.mockReturnValue({})
    const r = executeAiTool(mm, 'set_node_body', { uid: 'c1', text: '段一\r\n\r\n段二  尾空格 \n' }, withAiCall)
    expect(r.ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('SET_NODE_DATA', expect.anything(), {
      body: '段一\n\n段二  尾空格 \n', note: '段一\n\n段二  尾空格 \n',
    })
  })

  test('渲染 miss(收起分支)显式拒绝并提示先展开', () => {
    const { mm } = makeMm(dataNode('root'))
    const r = executeAiTool(mm, 'set_node_body', { uid: 'x', text: 't' }, withAiCall)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('set_node_expand')
  })
})

describe('set_node_icon', () => {
  test('白名单名落 zen_ 前缀;现有 zen_status- 徽章前置保留', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, findNodeByUid } = makeMm(root)
    const inst = { getData: (k: string) => (k === 'icon' ? ['zen_status-todo', 'zen_flag'] : undefined) }
    findNodeByUid.mockReturnValue(inst)
    mm.execCommandIcon = vi.fn()
    const r = executeAiTool(mm, 'set_node_icon', { uid: 'c1', names: ['star', 'bug'] }, (fn) => fn())
    expect(r.ok).toBe(true)
    expect(mm.execCommandIcon).toHaveBeenCalledWith('c1', ['zen_status-todo', 'zen_star', 'zen_bug'])
  })

  test('非法名显式拒绝(白名单外)', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, findNodeByUid } = makeMm(root)
    findNodeByUid.mockReturnValue({})
    mm.execCommandIcon = vi.fn()
    const r = executeAiTool(mm, 'set_node_icon', { uid: 'c1', names: ['not-exist'] }, (fn) => fn())
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('not-exist')
    expect(mm.execCommandIcon).not.toHaveBeenCalled()
  })

  test('空数组=清空用户图标(徽章仍保留)', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, findNodeByUid } = makeMm(root)
    findNodeByUid.mockReturnValue({ getData: () => ['zen_status-todo'] })
    mm.execCommandIcon = vi.fn()
    executeAiTool(mm, 'set_node_icon', { uid: 'c1', names: [] }, (fn) => fn())
    expect(mm.execCommandIcon).toHaveBeenCalledWith('c1', ['zen_status-todo'])
  })
})

describe('set_node_tags', () => {
  test('整组覆写;超 10 个拒绝', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, findNodeByUid } = makeMm(root)
    findNodeByUid.mockReturnValue({})
    mm.execCommandTag = vi.fn()
    const ok = executeAiTool(mm, 'set_node_tags', { uid: 'c1', tags: ['a', 'b'] }, (fn) => fn())
    expect(ok.ok).toBe(true)
    expect(mm.execCommandTag).toHaveBeenCalledWith('c1', ['a', 'b'])
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`)
    const bad = executeAiTool(mm, 'set_node_tags', { uid: 'c1', tags: eleven }, (fn) => fn())
    expect(bad.ok).toBe(false)
    expect(bad.detail).toContain('10')
  })
})

describe('折叠工具组', () => {
  test('set_node_expand:布尔参数落 SET_NODE_EXPAND;缺 expanded 按 false 折叠(语义安全)', () => {
    const root = dataNode('root', {}, [dataNode('c1')])
    const { mm, execCommand, findNodeByUid } = makeMm(root)
    const inst = {}
    findNodeByUid.mockReturnValue(inst)
    const r = executeAiTool(mm, 'set_node_expand', { uid: 'c1', expanded: true }, (fn) => fn())
    expect(r.ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('SET_NODE_EXPAND', inst, true)
    const miss = executeAiTool(mm, 'set_node_expand', { uid: 'c1' }, (fn) => fn())
    expect(miss.ok).toBe(true)
    expect(execCommand).toHaveBeenLastCalledWith('SET_NODE_EXPAND', inst, false)
  })

  test('expand_all 落命令无参数', () => {
    const { mm, execCommand } = makeMm(dataNode('root'))
    const r = executeAiTool(mm, 'expand_all', {}, (fn) => fn())
    expect(r.ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('EXPAND_ALL')
  })

  test('collapse_to_level:合法层级落命令;非正整数拒绝', () => {
    const { mm, execCommand } = makeMm(dataNode('root'))
    const r = executeAiTool(mm, 'collapse_to_level', { level: 2 }, (fn) => fn())
    expect(r.ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('UNEXPAND_TO_LEVEL', 2)
    for (const bad of [0, -1, 1.5, '2']) {
      const rej = executeAiTool(mm, 'collapse_to_level', { level: bad }, (fn) => fn())
      expect(rej.ok).toBe(false)
      expect(rej.detail).toContain('level')
    }
  })
})
