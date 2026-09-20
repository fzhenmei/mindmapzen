// src/services/basketMount.test.ts —— 挂载管线（T2）：文本路径寻址 / 深度校验 / 挂载与撤销（文件层读改写）
import { describe, expect, test, vi } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { findZenNodeByPathText, mountIdea, nodeDepth, unmountIdea } from './basketMount'
import { parse } from './mdTree'
import type { ZenNode } from '../types/tree'

const tree = (md: string): ZenNode => {
  const r = parse(md)
  if (!r.ok) throw new Error(r.error)
  return r.tree
}

async function setup(): Promise<MemoryFsAdapter> {
  const fs = new MemoryFsAdapter()
  await fs.mkdir('/ws')
  await fs.writeTextFileAtomic('/ws/目标.md', '# 目标\n\n## 甲\n\n### 甲一\n\n## 乙\n')
  return fs
}

describe('findZenNodeByPathText', () => {
  test('文本链逐级定位；命中首个同名', () => {
    const t = tree('# 根\n\n## 甲\n\n### 甲一\n\n## 甲\n')
    const hit = findZenNodeByPathText(t, ['根', '甲'], '甲一')
    expect(hit?.text).toBe('甲一')
    const miss = findZenNodeByPathText(t, ['根', '不存在'], 'x')
    expect(miss).toBeNull()
  })
})

describe('nodeDepth', () => {
  test('根=1，逐层递增', () => {
    const t = tree('# 根\n\n## 甲\n\n### 甲一\n')
    expect(nodeDepth(t, t)).toBe(1)
    expect(nodeDepth(t, t.children[0]!)).toBe(2)
    expect(nodeDepth(t, t.children[0]!.children[0]!)).toBe(3)
  })
})

describe('mountIdea', () => {
  test('挂到目标节点末尾；带 body；磁盘已更新', async () => {
    const fs = await setup()
    const r = await mountIdea(fs, { mapPath: '/ws/目标.md', path: ['目标', '甲'], text: '甲' }, { text: '新点子', body: '补充' })
    expect(r).toEqual({ ok: true })
    const after = tree(await fs.readTextFile('/ws/目标.md'))
    const jia = findZenNodeByPathText(after, ['目标'], '甲')!
    expect(jia.children.at(-1)!.text).toBe('新点子')
    expect(jia.children.at(-1)!.body).toContain('补充')
  })

  test('目标节点不存在 → targetNotFound；图缺失 → mapMissing', async () => {
    const fs = await setup()
    expect(await mountIdea(fs, { mapPath: '/ws/目标.md', path: ['目标'], text: '无此节点' }, { text: 'x' })).toEqual({
      ok: false, reason: 'targetNotFound',
    })
    expect(await mountIdea(fs, { mapPath: '/ws/缺.md', path: [], text: '缺' }, { text: 'x' })).toEqual({
      ok: false, reason: 'mapMissing',
    })
  })

  test('落点深度 ≥7 且带 body → depthTooDeep（列表层不支持正文）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws')
    // 根(1) > 2 > 3 > 4 > 5 > 6 > 7：深度 7 的节点挂第 8 层 → 列表层
    await fs.writeTextFileAtomic('/ws/深.md', '# 1\n\n## 2\n\n### 3\n\n#### 4\n\n##### 5\n\n###### 6\n\n- 7\n')
    const r = await mountIdea(fs, { mapPath: '/ws/深.md', path: ['1', '2', '3', '4', '5', '6'], text: '7' }, { text: 'x', body: 'b' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('depthTooDeep')
    // 不带 body 可挂（列表层能放纯文本）
    const ok = await mountIdea(fs, { mapPath: '/ws/深.md', path: ['1', '2', '3', '4', '5', '6'], text: '7' }, { text: 'y' })
    expect(ok).toEqual({ ok: true })
  })
})

describe('unmountIdea（撤销）', () => {
  test('按父路径 + 文本从末尾删除插入节点；重复撤销 → targetNotFound', async () => {
    const fs = await setup()
    const target = { mapPath: '/ws/目标.md', path: ['目标'], text: '乙' }
    await mountIdea(fs, target, { text: '撤销我' })
    const r = await unmountIdea(fs, target, { text: '撤销我' })
    expect(r).toEqual({ ok: true })
    const after = tree(await fs.readTextFile('/ws/目标.md'))
    expect(findZenNodeByPathText(after, ['目标'], '乙')!.children.map((c) => c.text)).toEqual([])
    expect((await unmountIdea(fs, target, { text: '撤销我' })).ok).toBe(false)
  })
})

// 超简报增量：writeFailed 出口（禁止吞异常红线——写盘/序列化失败必须有显式出口与原因）
describe('mountIdea 失败出口', () => {
  test('写盘抛错 → writeFailed + detail + console.error，不吞', async () => {
    const fs = await setup()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeTextFileAtomic = async () => {
      throw new Error('磁盘满')
    }
    const r = await mountIdea(fs, { mapPath: '/ws/目标.md', path: ['目标'], text: '甲' }, { text: 'x' })
    expect(r).toEqual({ ok: false, reason: 'writeFailed', detail: expect.stringContaining('磁盘满') })
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  test('点子文本含换行（serialize 拒绝）→ writeFailed，目标图不被写坏', async () => {
    const fs = await setup()
    const before = await fs.readTextFile('/ws/目标.md')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await mountIdea(fs, { mapPath: '/ws/目标.md', path: ['目标'], text: '甲' }, { text: 'a\nb' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('writeFailed')
    expect(await fs.readTextFile('/ws/目标.md')).toBe(before)
    errSpy.mockRestore()
  })
})
