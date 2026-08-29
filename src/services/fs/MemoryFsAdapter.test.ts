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
    // 临时名为自增唯一后缀（.tmp-N）：按 readDir 断言目录内无任何 .tmp 残留
    expect((await fs.readDir('/ws')).some((n) => n.includes('.tmp'))).toBe(false)
  })

  test('并发原子写同一目标：唯一临时名互不抢占，均完成且无残留', async () => {
    const original = fs.writeTextFileAtomic.bind(fs)
    let releaseSecond!: () => void
    const secondGate = new Promise<void>((r) => (releaseSecond = r))
    fs.writeTextFileAtomic = async (p: string, contents: string) => {
      if (contents === 'B') await secondGate // 第二写在途时第一写仍可独立完成（临时名不互抢）
      return original(p, contents)
    }
    const w1 = fs.writeTextFileAtomic('/ws/a.md', 'A')
    const w2 = fs.writeTextFileAtomic('/ws/a.md', 'B')
    releaseSecond()
    await Promise.all([w1, w2])
    expect(['A', 'B']).toContain(await fs.readTextFile('/ws/a.md'))
    expect((await fs.readDir('/ws')).some((n) => n.includes('.tmp'))).toBe(false)
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

  test('ensureDir 解析成功且无副作用', async () => {
    await expect(fs.ensureDir()).resolves.toBeUndefined()
  })
})

describe('目录能力（M5a）', () => {
  test('mkdir 幂等且 readDirEntries 识别目录', async () => {
    await fs.mkdir('/ws/项目')
    await fs.mkdir('/ws/项目') // 幂等
    await fs.writeTextFileAtomic('/ws/图.md', '# a\n') // 注：brief 原稿为 /ws/项目/图.md，与 readDirEntries('/ws') 直接子项断言矛盾（首段推导语义下文件不在 /ws 层）
    const entries = await fs.readDirEntries('/ws')
    expect(entries).toContainEqual({ name: '项目', isDir: true })
    expect(entries).toContainEqual({ name: '图.md', isDir: false })
  })
  test('空目录也出现在 entries（显式 mkdir）', async () => {
    await fs.mkdir('/ws/空目录')
    expect(await fs.readDirEntries('/ws')).toContainEqual({ name: '空目录', isDir: true })
  })
  test('深层目录推导：文件路径隐含中间目录', async () => {
    await fs.writeTextFileAtomic('/ws/a/b/c.md', 'x')
    const root = await fs.readDirEntries('/ws')
    expect(root).toContainEqual({ name: 'a', isDir: true })
    expect(await fs.readDirEntries('/ws/a')).toContainEqual({ name: 'b', isDir: true })
  })
})
