import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { createDir, moveMap, readDirTree } from './desk'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('readDirTree', () => {
  test('递归返回纯目录树（空目录含；各层按名称排序）', async () => {
    await fs.mkdir('/ws/项目'); await fs.mkdir('/ws/项目/sub'); await fs.mkdir('/ws/灵感')
    await fs.writeTextFileAtomic('/ws/项目/a.md', 'x')
    const tree = await readDirTree(fs, '/ws')
    // 插入序为 项目、灵感，输出按拼音排序：lǐng(灵感) < xiàng(项目)
    expect(tree).toEqual([
      { name: '灵感', path: '灵感', children: [] },
      { name: '项目', path: '项目', children: [{ name: 'sub', path: '项目/sub', children: [] }] },
    ])
  })

  test('各层目录按名称排序（中文拼音 collation），与文件系统返回序解耦', async () => {
    // 乱序建目录：根层插入序 乙、丙、甲；丙内插入序 z、a（readDirEntries 按记录序返回，非有序）
    await fs.mkdir('/ws/乙'); await fs.mkdir('/ws/丙'); await fs.mkdir('/ws/甲')
    await fs.mkdir('/ws/丙/z'); await fs.mkdir('/ws/丙/a')
    const tree = await readDirTree(fs, '/ws')
    // 拼音序 bǐng(丙) < jiǎ(甲) < yǐ(乙)——亦区别于码点序（丙乙甲），证明走 zh collation 而非默认排序
    expect(tree.map((n) => n.name)).toEqual(['丙', '甲', '乙'])
    expect(tree[0]!.children.map((n) => n.name)).toEqual(['a', 'z'])
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

describe('隐藏 git 内部目录（M20 验收）', () => {
  test('readDirTree 不含 .git（启用版本管理后工作区的 git 内部仓库不进左树/内容区）', async () => {
    const fs = new MemoryFsAdapter()
    await fs.mkdir('/ws/.git/objects')
    await fs.writeTextFileAtomic('/ws/.git/HEAD', 'ref: refs/heads/master\n')
    await fs.mkdir('/ws/真目录')
    const tree = await readDirTree(fs, '/ws')
    expect(tree.map((n) => n.name)).toEqual(['真目录'])
  })
})
