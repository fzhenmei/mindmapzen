import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { sweepTmpOrphans } from './tmpSweep'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('sweepTmpOrphans', () => {
  test('清扫 .md/.zen.json 的 tmp 孤儿（回收站）', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'v1') // 正常文件（其 tmp 已被 rename 消费）
    await fs.writeTextFileAtomic('/ws/a.md.tmp-89', '泄漏') // 模拟泄漏：直接占位
    await fs.writeTextFileAtomic('/ws/a.zen.json.tmp-90', '{}')
    const n = await sweepTmpOrphans(fs, '/ws')
    expect(n).toBe(2)
    expect(await fs.exists('/ws/a.md.tmp-89')).toBe(false)
    expect(await fs.exists('/ws/a.zen.json.tmp-90')).toBe(false)
    expect(await fs.exists('/ws/a.md')).toBe(true) // 正常文件不动
    expect(fs.removeLog).toEqual(['/ws/a.md.tmp-89', '/ws/a.zen.json.tmp-90'])
  })
  test('非目标形态的 tmp 不误删', async () => {
    await fs.writeTextFileAtomic('/ws/notes.tmp-5', 'x')
    await fs.writeTextFileAtomic('/ws/b.md.tmp-abc', 'x') // 非纯数字后缀
    expect(await sweepTmpOrphans(fs, '/ws')).toBe(0)
    expect(await fs.exists('/ws/notes.tmp-5')).toBe(true)
  })
  test('目录条目跳过；空工作区 0', async () => {
    await fs.mkdir('/ws/dir.tmp-1')
    expect(await sweepTmpOrphans(fs, '/ws')).toBe(0)
    expect(await sweepTmpOrphans(fs, '/empty')).toBe(0)
  })
})
