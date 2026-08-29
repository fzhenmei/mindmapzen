import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { createDir, moveMap, readDirTree } from './desk'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('readDirTree', () => {
  test('递归返回纯目录树（空目录含）', async () => {
    await fs.mkdir('/ws/项目'); await fs.mkdir('/ws/项目/sub'); await fs.mkdir('/ws/灵感')
    await fs.writeTextFileAtomic('/ws/项目/a.md', 'x')
    const tree = await readDirTree(fs, '/ws')
    expect(tree).toEqual([
      { name: '项目', path: '项目', children: [{ name: 'sub', path: '项目/sub', children: [] }] },
      { name: '灵感', path: '灵感', children: [] },
    ])
  })
})
describe('createDir', () => {
  test('非法名中文报错；合法递归创建', async () => {
    // 注：brief 原稿非法例为 'a/b'，与同块 '新目录/子' 递归创建成功互斥（'/' 为合法分隔符），按同一意图改为段内非法字符 ':'
    await expect(createDir(fs, '/ws', 'a:b')).rejects.toThrow('名称不能包含')
    await createDir(fs, '/ws', '新目录/子')
    expect((await fs.readDirEntries('/ws/新目录')).map((e) => e.name)).toContain('子')
  })
})
describe('moveMap', () => {
  test('两文件同移 + 重名后缀 + MapInfo.relDir 更新', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', '# a\n'); await fs.writeTextFileAtomic('/ws/a.zen.json', '{}')
    await fs.mkdir('/ws/d1'); await fs.writeTextFileAtomic('/ws/d1/a.md', '# 已有\n')
    const info = await moveMap(fs, '/ws', 'a', '', 'd1')
    expect(info.relDir).toBe('d1')
    expect(info.name).toMatch(/^a-\d{8}-\d{4}/)
    expect(await fs.readTextFile('/ws/d1/' + info.name + '.md')).toBe('# a\n')
    expect(await fs.exists('/ws/d1/a.md')).toBe(true) // 原有未动
    expect(await fs.exists('/ws/a.md')).toBe(false)
  })
  test('目标无 sidecar 时只移 .md', async () => {
    await fs.writeTextFileAtomic('/ws/b.md', 'x')
    await fs.mkdir('/ws/d2')
    const info = await moveMap(fs, '/ws', 'b', '', 'd2')
    expect(await fs.exists('/ws/d2/' + info.name + '.md')).toBe(true)
  })
  test('同目录自碰撞守卫：fromRel/toRel 归一后相同则早返回原 MapInfo，不改名不落时间戳后缀', async () => {
    // 真实碰撞路径：源文件须真在 fromRel 所指子目录 a 内（/ws/a/a.md），toRel 带首尾斜杠（'/a/'）归一后相同；
    // 若无守卫，重名循环第一步 fs.exists('/ws/a/a.md') 就撞上源文件自身，导图会被静默误改名 a-YYYYMMDD-HHmm
    await fs.mkdir('/ws/a')
    await fs.writeTextFileAtomic('/ws/a/a.md', '# a\n')
    await fs.writeTextFileAtomic('/ws/a/a.zen.json', '{}')
    const info = await moveMap(fs, '/ws', 'a', 'a', '/a/')
    expect(info.name).toBe('a')
    expect(info.relDir).toBe('a')
    expect(info.mdPath).toBe('/ws/a/a.md')
    // 目录内恰两文件原位未动：无带时间戳后缀的误改名副本
    expect((await fs.readDirEntries('/ws/a')).map((e) => e.name).sort()).toEqual(['a.md', 'a.zen.json'])
    expect(await fs.exists('/ws/a/a.md')).toBe(true)
    expect(await fs.exists('/ws/a/a.zen.json')).toBe(true)
  })
})
