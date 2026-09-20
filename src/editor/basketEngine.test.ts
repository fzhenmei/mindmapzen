// src/editor/basketEngine.test.ts —— 篮子引擎端口（spec §4.2 就近引擎）：插入提首位 / 按文本删除 /
// 引擎未就绪让位文件层 / 引擎异常不吞。假引擎镜像 Render.js 的三条关键语义（是假件不是仿真器）：
//  · INSERT_CHILD_NODE 恒把新节点**追加**到根数据子节点表（insertChildNode：node.nodeData.children.push）
//  · UP_NODE / REMOVE_NODE 按**渲染节点实例**操作（upNode：node.parent/node.isRoot；removeNode：node.getData）
//  · 渲染延迟一拍（render() 走 setTimeout 0 + 布局 asyncRun）——刚插入的节点此刻还没有实例
import { describe, expect, test } from 'vitest'
import { createBasketEnginePort } from './basketEngine'
import type { MindMapHandle } from '../types/engine'

interface FakeChildData {
  text: string
  uid: string
  body?: string
}
interface FakeChild {
  data: FakeChildData
}
interface FakeInstance {
  uid: string
  isRoot: boolean
  parent: unknown
  getData: (k: string) => unknown
}

/** 假引擎：数据子节点表 = 渲染根实例的 nodeData.children（真机同源对象——MindMapNode.handleData
 *  原样返回入参，见 MindMapNode.js:205）；实例表模拟渲染产物（初始点子已渲染，新插入的要等下一拍） */
function fakeEngine(initial: ReadonlyArray<{ text: string; body?: string }> = []) {
  let seq = 0
  const children: FakeChild[] = []
  const instances = new Map<string, FakeInstance>()
  const commands: Array<{ cmd: string; args: unknown[] }> = []
  const rootInstance = { isRoot: true, parent: null as unknown, nodeData: { children } }

  const push = (text: string, body?: string): FakeChild => {
    seq += 1
    const child: FakeChild = { data: { text, uid: `idea-${seq}`, ...(body !== undefined ? { body } : {}) } }
    children.push(child)
    return child
  }
  const materialize = (child: FakeChild): void => {
    instances.set(child.data.uid, {
      uid: child.data.uid,
      isRoot: false,
      parent: rootInstance,
      getData: (k: string) => child.data[k as keyof FakeChildData],
    })
  }
  for (const idea of initial) materialize(push(idea.text, idea.body))

  const execCommand = (cmd: string, ...args: unknown[]): void => {
    commands.push({ cmd, args })
    if (cmd === 'INSERT_CHILD_NODE') {
      const data = args[2] as { text: string; body?: string }
      push(data.text, data.body)
      return
    }
    if (cmd === 'REMOVE_NODE') {
      for (const inst of (args[0] as Array<Partial<FakeInstance>> | undefined) ?? []) {
        // 真机 removeNode 按实例操作（node.isRoot/getData/parent 三件套）：传数据节点即 TypeError
        if (typeof inst.getData !== 'function' || inst.parent === undefined) {
          throw new TypeError('REMOVE_NODE 需要渲染节点实例')
        }
        const i = children.findIndex((c) => c.data.uid === inst.uid)
        if (i !== -1) children.splice(i, 1)
      }
      return
    }
    if (cmd === 'UP_NODE') {
      // 真机 upNode（Render.js:1066）：只认渲染节点实例（node.parent.children 与
      // node.nodeData.children 双 splice）；传数据节点即 node.parent undefined → TypeError
      const inst = args[0] as Partial<FakeInstance> | undefined
      if (inst === undefined || inst.isRoot === true) return
      if (inst.parent === undefined || inst.parent === null) {
        throw new TypeError('UP_NODE 需要渲染节点实例（node.parent 缺失）')
      }
    }
  }

  const mm = {
    execCommand,
    renderer: { root: rootInstance, findNodeByUid: (uid: string) => instances.get(uid) ?? null },
  } as unknown as MindMapHandle

  return { mm, children, commands, rootInstance, instances }
}

const texts = (children: FakeChild[]): string[] => children.map((c) => c.data.text)

describe('篮子引擎端口 insertIdea（spec §3.2 新点子在篮子最上）', () => {
  test('走 INSERT_CHILD_NODE（根实例 + 文本/正文），新点子落在根数据子节点首位、旧条目顺次后移', () => {
    const eng = fakeEngine([{ text: '旧一' }, { text: '旧二', body: '旧正文' }])
    const port = createBasketEnginePort(() => eng.mm)
    expect(port.insertIdea({ text: '新点子', body: '新正文' })).toBe(true)
    expect(texts(eng.children)).toEqual(['新点子', '旧一', '旧二'])
    expect(eng.children[0]!.data.body).toBe('新正文')
    const insert = eng.commands.find((c) => c.cmd === 'INSERT_CHILD_NODE')
    expect(insert?.args).toEqual([false, [eng.rootInstance], { text: '新点子', body: '新正文' }])
  })

  test('无正文的点子不写 body 字段（undefined ≠ 空串，节点数据不多带空字段）', () => {
    const eng = fakeEngine([{ text: '旧一' }])
    createBasketEnginePort(() => eng.mm).insertIdea({ text: '纯文本' })
    expect(eng.children[0]!.data).toEqual({ text: '纯文本', uid: expect.any(String) })
  })

  test('空篮子首插即在首位；连插两条 = 后插的在最上（收件箱直觉）', () => {
    const eng = fakeEngine()
    const port = createBasketEnginePort(() => eng.mm)
    port.insertIdea({ text: '甲' })
    port.insertIdea({ text: '乙' })
    expect(texts(eng.children)).toEqual(['乙', '甲'])
  })

  test('引擎未就绪（无句柄 / 无渲染 root）：返回 false 让位文件层，不抛', () => {
    expect(createBasketEnginePort(() => null).insertIdea({ text: '甲' })).toBe(false)
    const bare = { execCommand: () => {}, renderer: {} } as unknown as MindMapHandle
    expect(createBasketEnginePort(() => bare).insertIdea({ text: '甲' })).toBe(false)
  })

  test('引擎命令抛出即原样上抛，不吞（T4 端口调用点的 try/catch 是唯一出口；回落到文件层会双写）', () => {
    const eng = fakeEngine([{ text: '甲' }])
    const mm = {
      execCommand: () => {
        throw new Error('引擎炸了')
      },
      renderer: eng.mm.renderer,
    } as unknown as MindMapHandle
    expect(() => createBasketEnginePort(() => mm).insertIdea({ text: '乙' })).toThrow('引擎炸了')
  })
})

describe('篮子引擎端口 removeIdeaByText', () => {
  test('按文本命中根下首个点子：REMOVE_NODE 收渲染节点实例（非数据节点）并摘除该条', () => {
    const eng = fakeEngine([{ text: '甲' }, { text: '乙' }, { text: '甲' }])
    const port = createBasketEnginePort(() => eng.mm)
    expect(port.removeIdeaByText('甲')).toBe(true)
    expect(texts(eng.children)).toEqual(['乙', '甲']) // 只删首个命中
    const rm = eng.commands.find((c) => c.cmd === 'REMOVE_NODE')
    expect(rm?.args[0]).toEqual([eng.instances.get('idea-1')])
  })

  test('未命中 / 引擎未就绪：返回 false 让位文件层', () => {
    const eng = fakeEngine([{ text: '甲' }])
    expect(createBasketEnginePort(() => eng.mm).removeIdeaByText('无此条')).toBe(false)
    expect(createBasketEnginePort(() => null).removeIdeaByText('甲')).toBe(false)
    expect(texts(eng.children)).toEqual(['甲'])
  })

  test('文本命中但渲染实例失联（根被收起等）：返回 false 让位文件层，不抛', () => {
    const eng = fakeEngine([{ text: '甲' }])
    eng.instances.clear() // 节点不在渲染树 → findNodeByUid miss
    expect(createBasketEnginePort(() => eng.mm).removeIdeaByText('甲')).toBe(false)
    expect(texts(eng.children)).toEqual(['甲'])
  })
})
