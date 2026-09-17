// src/services/workbench.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import type { FsAdapter } from '../types/files'
import { scanWorkTasks, scanWorkTasksCached, WORK_DIR } from './workbench'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('scanWorkTasks', () => {
  test('工作目录不存在：dirExists=false 空扫描（空态引导创建分支）', async () => {
    await fs.writeTextFileAtomic('/ws/别处.md', '# 别处\n')
    const r = await scanWorkTasks(fs, '/ws')
    expect(r).toEqual({ dirExists: false, maps: [], tasks: [], failed: [] })
  })

  test('聚合多图任务：卡片口径同源（状态/截断/来源字段），目录外与无状态节点不进', async () => {
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/图A.md`, '# 图A\n\n## 任务一 @todo\n\n### 补充说明\n\n## 分支 @done\n')
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/子/图B.md`, '# 图B\n\n## 任务二 @doing\n')
    await fs.writeTextFileAtomic('/ws/创作.md', '# 创作图\n\n## 文章任务 @todo\n')
    const r = await scanWorkTasks(fs, '/ws')
    expect(r.dirExists).toBe(true)
    expect(r.failed).toEqual([])
    expect(r.maps.map((m) => m.mapName).sort()).toEqual(['图A', '图B'])
    const t1 = r.tasks.find((t) => t.text === '任务一')!
    expect(t1.status).toBe('todo')
    expect(t1.mapName).toBe('图A')
    expect(t1.mapPath).toBe(`/ws/${WORK_DIR}/图A.md`)
    expect(t1.outline.map((l) => l.text)).toEqual(['补充说明']) // 无状态后代进大纲（截断口径同源）
    expect(r.tasks.find((t) => t.text === '文章任务')).toBeUndefined() // 工作目录外不聚合
    expect(r.tasks.find((t) => t.text === '分支')?.status).toBe('done')
  })

  test('单文件读取失败：进 failed 不中断其余图聚合（不吞异常：console.error 出口）', async () => {
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/好图.md`, '# 好图\n\n## 任务 @todo\n')
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/坏图.md`, '# 坏图\n')
    // 原型链包装覆写单方法：readTextFile 对坏图抛 IO 错（模拟磁盘/权限故障）
    const wrap = Object.create(fs) as FsAdapter
    wrap.readTextFile = (p: string) => (p.endsWith('坏图.md') ? Promise.reject(new Error('io')) : fs.readTextFile(p))
    const r = await scanWorkTasks(wrap, '/ws')
    expect(r.failed).toEqual(['坏图'])
    expect(r.tasks.map((t) => t.text)).toEqual(['任务'])
    expect(r.maps.map((m) => m.mapName).sort()).toEqual(['坏图', '好图']) // sort 按 UTF-16 码元：坏(U+574F) < 好(U+597D)
  })
})

describe('scanWorkTasksCached mtime 指纹缓存', () => {
  beforeEach(() => {
    // MemoryFsAdapter 的 mtime 取 Date.now() 毫秒墙钟——同毫秒内连续重写同一文件 mtime
    // 不变，会让"内容变了但指纹没变"偶发误命中；冻结假钟逐步推进，写入 mtime 严格递增
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('缓存命中：mtime 全等时第二次调用零文件读取', async () => {
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/a.md`, '# a\n\n## t1 @todo\n')
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/子/b.md`, '# b\n\n## t2 @doing\n')
    const first = await scanWorkTasksCached(fs, '/ws')
    expect(first.tasks.map((x) => x.text)).toEqual(['t1', 't2'])
    const readSpy = vi.spyOn(fs, 'readTextFile')
    const second = await scanWorkTasksCached(fs, '/ws')
    expect(second).toBe(first) // 同引用 = 缓存直返
    expect(readSpy).not.toHaveBeenCalled()
  })

  test('mtime 变化 / 文件增删：指纹不符重扫', async () => {
    vi.setSystemTime(1000)
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/a.md`, '# a\n\n## t1 @todo\n')
    await scanWorkTasksCached(fs, '/ws')
    vi.setSystemTime(2000)
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/a.md`, '# a\n\n## 改 @done\n') // 内容变（mtime 变）
    const r1 = await scanWorkTasksCached(fs, '/ws')
    expect(r1.tasks[0]!.status).toBe('done')
    vi.setSystemTime(3000)
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/new.md`, '# n\n\n## t3 @blocked\n') // 增文件（@wait 非项目状态词，brief 笔误改 @blocked）
    const r2 = await scanWorkTasksCached(fs, '/ws')
    expect(r2.tasks.map((x) => x.text)).toContain('t3')
    await fs.remove(`/ws/${WORK_DIR}/new.md`) // 删文件（键集合变）
    const r3 = await scanWorkTasksCached(fs, '/ws')
    expect(r3.tasks.map((x) => x.text)).not.toContain('t3')
  })

  test('工作目录不存在：返回空扫且清缓存（下次创建后能扫到）', async () => {
    await fs.writeTextFileAtomic('/ws/其他/x.md', '# x\n')
    const r = await scanWorkTasksCached(fs, '/ws')
    expect(r.dirExists).toBe(false)
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/a.md`, '# a\n\n## t1 @todo\n')
    const r2 = await scanWorkTasksCached(fs, '/ws')
    expect(r2.tasks).toHaveLength(1)
  })

  test('换工作区：缓存不串（wsDir 不等即重扫）', async () => {
    await fs.writeTextFileAtomic(`/ws/${WORK_DIR}/a.md`, '# a\n\n## t1 @todo\n')
    const r = await scanWorkTasksCached(fs, '/ws1') // 同 fs 不同 wsDir（dirExists false 场景）
    expect(r.dirExists).toBe(false)
    const r2 = await scanWorkTasksCached(fs, '/ws2')
    expect(r2.dirExists).toBe(false)
  })
})
