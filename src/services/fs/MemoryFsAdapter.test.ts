import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './MemoryFsAdapter'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('MemoryFsAdapter', () => {
  test('写入后可读取', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', '# 根\n')
    expect(await fs.readTextFile('/ws/a.md')).toBe('# 根\n')
  })

  test('原子写覆盖旧内容且不留临时文件', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'v1')
    await fs.writeTextFileAtomic('/ws/a.md', 'v2')
    expect(await fs.readTextFile('/ws/a.md')).toBe('v2')
    expect(await fs.exists('/ws/a.md.tmp')).toBe(false)
  })

  test('readDir 返回目录内文件名', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'x')
    await fs.writeTextFileAtomic('/ws/a.zen.json', '{}')
    expect((await fs.readDir('/ws')).sort()).toEqual(['a.md', 'a.zen.json'])
  })

  test('rename 覆盖已存在目标', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'x')
    await fs.writeTextFileAtomic('/ws/b.md', 'y')
    await fs.rename('/ws/a.md', '/ws/b.md')
    expect(await fs.readTextFile('/ws/b.md')).toBe('x')
  })

  test('remove 记录日志', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'x')
    await fs.remove('/ws/a.md')
    expect(await fs.exists('/ws/a.md')).toBe(false)
    expect(fs.removeLog).toEqual(['/ws/a.md'])
  })

  test('statModified 随写入更新', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'x')
    const t1 = await fs.statModified('/ws/a.md')
    expect(t1).toBeGreaterThan(0)
  })
})
