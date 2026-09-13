// src/services/workbenchSuggest.test.ts
import { describe, expect, test } from 'vitest'
import { buildSuggestPrompt, STALE_MAP_DAYS, suggestNext } from './workbenchSuggest'
import type { WorkScan, WorkTask } from './workbench'

const DAY = 24 * 3600 * 1000
const NOW = 1_700_000_000_000
/** 手工夹具：task 按序给定 status/mtime/mapName，其余字段最小填充 */
const scanOf = (specs: Array<{ status: WorkTask['status']; mtime: number; mapName?: string }>, mapMtimes: Record<string, number> = {}): WorkScan => {
  const tasks: WorkTask[] = specs.map((s, i) => ({
    uid: `u${i}`, text: `任务${i}`, status: s.status, path: [], icons: [], tags: [], hasBody: false, childCount: 0, outline: [],
    mapPath: `/ws/工作/${s.mapName ?? '图A'}.md`, mapName: s.mapName ?? '图A', dirRel: '', mtime: s.mtime,
  }))
  const mapNames = [...new Set([...Object.keys(mapMtimes), ...tasks.map((t) => t.mapName)])]
  return {
    dirExists: true,
    maps: mapNames.map((n) => ({ mapPath: `/ws/工作/${n}.md`, mapName: n, dirRel: '', mtime: mapMtimes[n] ?? NOW })),
    tasks, failed: [],
  }
}

describe('suggestNext（spec §6 名额 1/1/2/1，不越位补位）', () => {
  test('R1 doing 取图 mtime 最新 1 条', () => {
    const r = suggestNext(scanOf([{ status: 'doing', mtime: 1 }, { status: 'doing', mtime: 5, mapName: '图B' }]), NOW)
    const fin = r.filter((s) => s.kind === 'finish')
    expect(fin).toHaveLength(1)
    expect(fin[0]!.task?.mapName).toBe('图B')
    expect(fin[0]!.reasonKey).toBe('workbench.suggest.finish')
  })
  test('R2 blocked 取图 mtime 最旧 1 条', () => {
    const r = suggestNext(scanOf([{ status: 'blocked', mtime: 9 }, { status: 'blocked', mtime: 2, mapName: '图B' }]), NOW)
    const blk = r.filter((s) => s.kind === 'blocked')
    expect(blk).toHaveLength(1)
    expect(blk[0]!.task?.mapName).toBe('图B')
  })
  test('R3 todo 按 mtime 升序至多 2 条', () => {
    const r = suggestNext(scanOf([{ status: 'todo', mtime: 5 }, { status: 'todo', mtime: 1 }, { status: 'todo', mtime: 3 }, { status: 'todo', mtime: 2 }]), NOW)
    const stale = r.filter((s) => s.kind === 'stale-todo')
    expect(stale.map((s) => s.task?.mtime)).toEqual([1, 2])
  })
  test('R4 图停滞：mtime 早于 now-7 天的最久一张；恰好 7 天整不触发（严格小于）', () => {
    const justOld = { 图A: NOW - STALE_MAP_DAYS * DAY }
    expect(suggestNext(scanOf([], justOld), NOW).filter((s) => s.kind === 'stale-map')).toHaveLength(0)
    const older = { 图A: NOW - 8 * DAY, 图B: NOW - 9 * DAY }
    const r = suggestNext(scanOf([], older), NOW).filter((s) => s.kind === 'stale-map')
    expect(r).toHaveLength(1)
    expect(r[0]!.mapName).toBe('图B') // 最久未动
    expect(r[0]!.mapPath).toBe('/ws/工作/图B.md')
  })
  test('全空扫描：零建议（不硬凑）', () => {
    expect(suggestNext({ dirExists: true, maps: [{ mapPath: '/ws/工作/a.md', mapName: 'a', dirRel: '', mtime: NOW }], tasks: [], failed: [] }, NOW)).toEqual([])
  })
})

describe('buildSuggestPrompt', () => {
  test('含任务清单（图分组/状态/路径段）与规则建议', () => {
    const scan = scanOf([{ status: 'todo', mtime: 1 }], { 图A: NOW })
    const sug = suggestNext(scan, NOW)
    const p = buildSuggestPrompt(scan, sug)
    expect(p).toContain('任务0 [todo]')
    expect(p).toContain('图「图A」')
    expect(p).toContain('stale-todo')
  })
})
