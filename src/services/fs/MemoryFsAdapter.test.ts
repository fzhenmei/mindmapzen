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

  test('writeBytes 存二进制且 readBytes 逐字节还原；exists 对二进制文件成立', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47])
    await fs.writeBytes('/ws/a.png', bytes)
    expect([...(await fs.readBytes('/ws/a.png'))]).toEqual([...bytes])
    expect(await fs.exists('/ws/a.png')).toBe(true)
    // 覆盖写：后写胜出
    await fs.writeBytes('/ws/a.png', Uint8Array.from([1, 2]))
    expect(await fs.readBytes('/ws/a.png')).toHaveLength(2)
  })

  test('writeBytes 的文件出现在 readDir 与 readDirEntries（推导语义同文本文件）', async () => {
    await fs.writeBytes('/ws/a.png', Uint8Array.of(1))
    expect(await fs.readDir('/ws')).toEqual(['a.png'])
    expect(await fs.readDirEntries('/ws')).toContainEqual({ name: 'a.png', isDir: false })
  })

  test('readBytes 读不存在的二进制文件报错', async () => {
    await expect(fs.readBytes('/ws/无.png')).rejects.toThrow('文件不存在')
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

describe('stat 元数据（M15）', () => {
  test('文本文件：字节大小按 UTF-8 实长计（中文内容 ≠ 字符数）', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', '# 根主题')
    const s = await fs.stat('/ws/a.md')
    expect(s.size).toBe(new TextEncoder().encode('# 根主题').length)
    expect(s.createdAt).toBeGreaterThan(0)
    expect(s.modifiedAt).toBeGreaterThanOrEqual(s.createdAt)
  })

  test('rename 保留 createdAt（同真实 FS birthtime 语义）', async () => {
    await fs.writeTextFileAtomic('/ws/a.md', 'v1')
    const before = await fs.stat('/ws/a.md')
    await fs.rename('/ws/a.md', '/ws/b.md')
    const after = await fs.stat('/ws/b.md')
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.modifiedAt).toBeGreaterThanOrEqual(before.modifiedAt)
  })

  test('二进制条目走 bytes.length；缺失路径抛中文错误', async () => {
    await fs.writeBytes('/ws/p.png', new Uint8Array([1, 2, 3]))
    expect((await fs.stat('/ws/p.png')).size).toBe(3)
    await expect(fs.stat('/ws/none.md')).rejects.toThrow('文件不存在')
  })
})
