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
})
