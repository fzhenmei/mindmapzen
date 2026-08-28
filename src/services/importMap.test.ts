import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { commitImport } from './importMap'
import type { ZenNode } from '../types/tree'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

const tree: ZenNode = { text: '导入的图', children: [{ text: 'A', children: [] }] }

describe('commitImport', () => {
  test('复制入库：md + sidecar 齐全，内容为规范序列化', async () => {
    const info = await commitImport(fs, '/ws', '新图', tree)
    expect(info.name).toBe('新图')
    expect(await fs.readTextFile('/ws/新图.md')).toBe('# 导入的图\n\n## A\n')
    expect(await fs.exists('/ws/新图.zen.json')).toBe(true)
  })
  test('同名冲突自动加时间戳后缀', async () => {
    await commitImport(fs, '/ws', 'a', tree)
    const info = await commitImport(fs, '/ws', 'a', tree)
    expect(info.name).toMatch(/^a-\d{8}-\d{4}$/)
    expect(await fs.exists('/ws/a.md')).toBe(true) // 原文件未被覆盖
  })
  test('同分钟内第三次导入追加序号防撞：三个文件互异且内容各自完好', async () => {
    // 时间戳后缀精确到分钟：同一分钟内连续导入会在同名时间戳上二次相撞，须追加序号而非静默覆盖
    const t1: ZenNode = { text: '第一份', children: [] }
    const t2: ZenNode = { text: '第二份', children: [] }
    const t3: ZenNode = { text: '第三份', children: [] }
    const i1 = await commitImport(fs, '/ws', 'a', t1)
    const i2 = await commitImport(fs, '/ws', 'a', t2)
    const i3 = await commitImport(fs, '/ws', 'a', t3)
    expect(new Set([i1.mdPath, i2.mdPath, i3.mdPath]).size).toBe(3) // 三个不同文件
    expect(i1.name).toBe('a')
    expect(i2.name).toMatch(/^a-\d{8}-\d{4}$/) // 第二次：时间戳后缀（与既有断言口径一致）
    expect(i3.name).toMatch(/^a-\d{8}-\d{4}-\d+$/) // 第三次：时间戳 + 序号
    expect(await fs.readTextFile(`/ws/${i1.name}.md`)).toBe('# 第一份\n') // 无一被覆盖
    expect(await fs.readTextFile(`/ws/${i2.name}.md`)).toBe('# 第二份\n')
    expect(await fs.readTextFile(`/ws/${i3.name}.md`)).toBe('# 第三份\n')
    expect(await fs.exists(`/ws/${i3.name}.zen.json`)).toBe(true) // 新副本 sidecar 齐全
  })
})
