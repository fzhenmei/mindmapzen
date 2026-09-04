import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { createMap, deleteMap, listMaps, renameMap } from './workspace'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('workspace', () => {
  test('createMap 写入占位根并出现在列表', async () => {
    const info = await createMap(fs, '/ws', '新想法')
    expect(info.name).toBe('新想法')
    expect(await fs.readTextFile('/ws/新想法.md')).toBe('# 新想法\n')
    expect((await listMaps(fs, '/ws')).map((m) => m.name)).toEqual(['新想法'])
  })

  test('非法名称抛中文错误', async () => {
    await expect(createMap(fs, '/ws', '')).rejects.toThrow('名称不能为空')
    await expect(createMap(fs, '/ws', '  ')).rejects.toThrow('名称不能为空')
    await expect(createMap(fs, '/ws', 'a/b')).rejects.toThrow('名称不能包含 \\ / : * ? " < > |')
    await expect(createMap(fs, '/ws', 'a:b')).rejects.toThrow('名称不能包含')
  })

  test('重名抛错', async () => {
    await createMap(fs, '/ws', 'a')
    await expect(createMap(fs, '/ws', 'a')).rejects.toThrow('已存在同名导图')
  })

  // 2026-09 树右键「在此新建导图」：relDir 指定目标子目录（既有调用缺省 '' 行为不变）
  test('createMap relDir 落盘子目录并带元信息', async () => {
    await fs.mkdir('/ws/项目')
    const info = await createMap(fs, '/ws', '子图', 'mindmap', undefined, '项目')
    expect(info.relDir).toBe('项目')
    expect(info.mdPath).toBe('/ws/项目/子图.md')
    expect(await fs.readTextFile('/ws/项目/子图.md')).toBe('# 子图\n')
    expect(await fs.exists('/ws/项目/子图.zen.json')).toBe(true)
    // 同目录重名仍拦截（检测路径随 relDir 走）
    await expect(createMap(fs, '/ws', '子图', 'mindmap', undefined, '项目')).rejects.toThrow('已存在同名导图')
  })

  test('listMaps 忽略非 .md 文件且按修改时间降序', async () => {
    const a = await createMap(fs, '/ws', 'a')
    await createMap(fs, '/ws', 'b')
    await fs.writeTextFileAtomic('/ws/notes.txt', 'x')
    const list = await listMaps(fs, '/ws')
    expect(list.map((m) => m.name)).toEqual(['b', a.name === 'a' ? 'a' : 'a'])
    expect(list.every((m) => m.mdPath.endsWith('.md'))).toBe(true)
  })

  // 以下 renameMap/deleteMap 用例均以 relDir=''（工作区根）调用——即 M5a 终审修复后根下行为不变
  test('renameMap 同步改名两个文件', async () => {
    await createMap(fs, '/ws', 'a')
    await renameMap(fs, '/ws', '', 'a', 'b')
    expect(await fs.exists('/ws/a.md')).toBe(false)
    expect(await fs.exists('/ws/b.md')).toBe(true)
    expect(await fs.exists('/ws/a.zen.json')).toBe(false)
    expect(await fs.exists('/ws/b.zen.json')).toBe(true)
  })

  test('renameMap 撞名时抛中文错误且不覆盖既有导图', async () => {
    await createMap(fs, '/ws', 'a')
    await createMap(fs, '/ws', 'b')
    await fs.writeTextFileAtomic('/ws/b.md', '# b 的内容\n')
    await expect(renameMap(fs, '/ws', '', 'a', 'b')).rejects.toThrow('已存在同名导图：b')
    // b 内容未被覆盖，a 也原样保留
    expect(await fs.readTextFile('/ws/b.md')).toBe('# b 的内容\n')
    expect(await fs.exists('/ws/a.md')).toBe(true)
  })

  test('renameMap 源 .md 缺失时抛中文错误（不外泄适配器英文异常）', async () => {
    await expect(renameMap(fs, '/ws', '', '不存在', 'c')).rejects.toThrow('源导图不存在：不存在')
  })

  test('renameMap 改成原名为无操作，不误报撞名', async () => {
    await createMap(fs, '/ws', 'a')
    await renameMap(fs, '/ws', '', 'a', 'a')
    expect(await fs.exists('/ws/a.md')).toBe(true)
  })

  test('deleteMap 两个文件一起删除', async () => {
    await createMap(fs, '/ws', 'a')
    await fs.writeTextFileAtomic('/ws/a.zen.json', '{}')
    await deleteMap(fs, '/ws', '', 'a')
    expect(await fs.exists('/ws/a.md')).toBe(false)
    expect(await fs.exists('/ws/a.zen.json')).toBe(false)
    expect(fs.removeLog.sort()).toEqual(['/ws/a.md', '/ws/a.zen.json'])
  })

  test('renameMap 子目录内改名：两文件在目录内改名，根下同名图不受影响（遮蔽防护）', async () => {
    // 根与 /ws/sub 各有一张「a」：修复前 renameMap 只按根路径拼装——子目录改名 100% 落空，
    // 根下同名图反被误改（遮蔽）。修复后按 relDir 定位 /ws/sub，根下 a 原样不动
    await fs.mkdir('/ws/sub')
    await fs.writeTextFileAtomic('/ws/sub/a.md', '# 子目录的 a\n')
    await fs.writeTextFileAtomic('/ws/sub/a.zen.json', '{}')
    await createMap(fs, '/ws', 'a')
    await renameMap(fs, '/ws', 'sub', 'a', 'b')
    expect(await fs.readTextFile('/ws/sub/b.md')).toBe('# 子目录的 a\n')
    expect(await fs.exists('/ws/sub/b.zen.json')).toBe(true)
    expect(await fs.exists('/ws/sub/a.md')).toBe(false)
    expect(await fs.exists('/ws/sub/a.zen.json')).toBe(false)
    // 根下同名图未被越层命中：内容与 sidecar 原样
    expect(await fs.readTextFile('/ws/a.md')).toBe('# a\n')
    expect(await fs.exists('/ws/a.zen.json')).toBe(true)
  })

  test('deleteMap 子目录内删除：目录内两文件齐删，根下同名图不受影响', async () => {
    await fs.mkdir('/ws/sub')
    await fs.writeTextFileAtomic('/ws/sub/a.md', '# 子目录的 a\n')
    await fs.writeTextFileAtomic('/ws/sub/a.zen.json', '{}')
    await createMap(fs, '/ws', 'a')
    await deleteMap(fs, '/ws', 'sub', 'a')
    expect(fs.removeLog.sort()).toEqual(['/ws/sub/a.md', '/ws/sub/a.zen.json'])
    expect(await fs.exists('/ws/sub/a.md')).toBe(false)
    expect(await fs.exists('/ws/sub/a.zen.json')).toBe(false)
    // 根下同名图未被越层删除
    expect(await fs.readTextFile('/ws/a.md')).toBe('# a\n')
    expect(await fs.exists('/ws/a.zen.json')).toBe(true)
  })

  test('listMaps 填充 relDir（子目录文件 → 相对目录段）', async () => {
    await fs.mkdir('/ws/sub')
    await fs.writeTextFileAtomic('/ws/sub/c.md', '# c\n')
    const list = await listMaps(fs, '/ws')
    const c = list.find((m) => m.name === 'c')
    expect(c?.relDir).toBe('sub')
  })
})
