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
    expect(await fs.readTextFile('/ws/新想法.md')).toBe('# 根主题\n')
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

  test('listMaps 忽略非 .md 文件且按修改时间降序', async () => {
    const a = await createMap(fs, '/ws', 'a')
    await createMap(fs, '/ws', 'b')
    await fs.writeTextFileAtomic('/ws/notes.txt', 'x')
    const list = await listMaps(fs, '/ws')
    expect(list.map((m) => m.name)).toEqual(['b', a.name === 'a' ? 'a' : 'a'])
    expect(list.every((m) => m.mdPath.endsWith('.md'))).toBe(true)
  })

  test('renameMap 同步改名两个文件', async () => {
    await createMap(fs, '/ws', 'a')
    await renameMap(fs, '/ws', 'a', 'b')
    expect(await fs.exists('/ws/a.md')).toBe(false)
    expect(await fs.exists('/ws/b.md')).toBe(true)
    expect(await fs.exists('/ws/a.zen.json')).toBe(false)
    expect(await fs.exists('/ws/b.zen.json')).toBe(true)
  })

  test('deleteMap 两个文件一起删除', async () => {
    await createMap(fs, '/ws', 'a')
    await fs.writeTextFileAtomic('/ws/a.zen.json', '{}')
    await deleteMap(fs, '/ws', 'a')
    expect(await fs.exists('/ws/a.md')).toBe(false)
    expect(await fs.exists('/ws/a.zen.json')).toBe(false)
    expect(fs.removeLog.sort()).toEqual(['/ws/a.md', '/ws/a.zen.json'])
  })
})
