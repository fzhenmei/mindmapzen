// src/services/basket.test.ts —— 点子篮子数据层：路径约定 / 建篮 / 树操作与解析（T1）
import { describe, expect, test, vi } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { basketAbsPath, defaultBasketName, ensureBasket, insertIdeaIntoTree, parseBasketIdeas, parseBasketIdeasFromEngine, readBasketIdeas, resolveBasketRelPath } from './basket'
import type { ZenNode } from '../types/tree'
import type { EngineNode } from '../types/engine'

const node = (text: string, children: ZenNode[] = [], body?: string): ZenNode => ({ text, children, ...(body ? { body } : {}) })

describe('篮子路径约定', () => {
  test('默认名随语言；cfg 有值原样返回', () => {
    expect(defaultBasketName('zh-CN')).toBe('点子篮子')
    expect(defaultBasketName('en')).toBe('Idea Inbox')
    expect(resolveBasketRelPath(null, 'zh-CN')).toBe('点子篮子.md')
    expect(resolveBasketRelPath('我的篮.md', 'en')).toBe('我的篮.md')
    expect(basketAbsPath('/ws', '子/篮.md')).toBe('/ws/子/篮.md')
  })
})

describe('ensureBasket', () => {
  test('不存在则创建根节点；已存在不覆盖', async () => {
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    await ensureBasket(fs, '/ws', '点子篮子.md', '点子篮子')
    expect(await fs.readTextFile('/ws/点子篮子.md')).toBe('# 点子篮子\n')
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 已有点子\n')
    await ensureBasket(fs, '/ws', '点子篮子.md', '点子篮子')
    expect(await fs.readTextFile('/ws/点子篮子.md')).toContain('已有点子')
  })

  test('嵌套 relPath：先建父目录再写（Tauri 写盘不建目录，内存 FS 抓不到），文件落正确绝对路径', async () => {
    const fs = new MemoryFsAdapter()
    const dirSpy = vi.spyOn(fs, 'ensureDir')
    await ensureBasket(fs, '/ws', '子/篮.md', '篮')
    expect(dirSpy).toHaveBeenCalledWith('/ws/子')
    expect(await fs.readTextFile('/ws/子/篮.md')).toBe('# 篮\n')
    dirSpy.mockRestore()
  })
})

describe('树操作与解析', () => {
  test('insertIdeaIntoTree 插根下首位且不可变', () => {
    const tree = node('篮', [node('旧')])
    const next = insertIdeaIntoTree(tree, { text: '新', body: '说明' })
    expect(next.children.map((c) => c.text)).toEqual(['新', '旧'])
    expect(next.children[0]!.body).toBe('说明')
    expect(tree.children.map((c) => c.text)).toEqual(['旧']) // 原树不动
  })

  test('parseBasketIdeas 取根的直接子节点（text+body）', () => {
    const tree = node('篮', [node('a', [], 'a 的说明'), node('b')])
    expect(parseBasketIdeas(tree)).toEqual([{ text: 'a', body: 'a 的说明' }, { text: 'b' }])
  })

  test('parseBasketIdeasFromEngine 读渲染节点实例的 nodeData 子节点（Task 9 调用口径：renderer.root）', () => {
    const root = { nodeData: { children: [{ data: { text: 'a', body: '说明' } }, { data: { text: 'b', body: '' } }] } }
    expect(parseBasketIdeasFromEngine(root)).toEqual([{ text: 'a', body: '说明' }, { text: 'b' }])
  })

  test('parseBasketIdeasFromEngine：误传 renderTree 形态（无 nodeData）→ console.error 出口 + 空表，不静默', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderTree: EngineNode = { data: { text: '篮' }, children: [{ data: { text: 'a' } }] }
    expect(parseBasketIdeasFromEngine(renderTree as never)).toEqual([])
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('nodeData'), renderTree)
    errSpy.mockRestore()
  })
})

describe('readBasketIdeas（文件层）', () => {
  test('读+解析出点子；篮子不存在返回 null', async () => {
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    expect(await readBasketIdeas(fs, '/ws', '点子篮子.md')).toBeNull()
    await fs.writeTextFileAtomic('/ws/点子篮子.md', '# 点子篮子\n\n- 第一个\n')
    expect(await readBasketIdeas(fs, '/ws', '点子篮子.md')).toEqual([{ text: '第一个' }])
  })
})
