// src/services/workbench.test.ts
import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import type { FsAdapter } from '../types/files'
import { scanWorkTasks, WORK_DIR } from './workbench'

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
