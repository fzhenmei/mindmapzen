// src/services/workbenchSuggest.test.ts
import { describe, expect, test } from 'vitest'
import { adviceFingerprint, buildSuggestPrompt, STALE_MAP_DAYS, suggestNext, WIP_WARN } from './workbenchSuggest'
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

describe('suggestNext（spec §6 名额 1/1/2/1/1、上限 6，不越位补位）', () => {
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

describe('R5 no-next（项目开放回路检查，GTD：每个开放项目要有下一步行动）', () => {
  test('blocked-only 图触发：map 级建议（无 task），多张取 mtime 最旧', () => {
    const r = suggestNext(
      scanOf([{ status: 'blocked', mtime: 1, mapName: '图A' }, { status: 'blocked', mtime: 1, mapName: '图B' }], { 图A: NOW - 5 * DAY, 图B: NOW - 9 * DAY }),
      NOW,
    ).filter((s) => s.kind === 'no-next')
    expect(r).toHaveLength(1)
    expect(r[0]!.task).toBeUndefined()
    expect(r[0]!.mapName).toBe('图B')
    expect(r[0]!.mapPath).toBe('/ws/工作/图B.md')
    expect(r[0]!.reasonKey).toBe('workbench.suggest.noNext')
  })
  test('纯 done/dropped 图不触发（做完了就是做完了，无开放回路）', () => {
    const r = suggestNext(scanOf([{ status: 'done', mtime: 1 }, { status: 'dropped', mtime: 2 }]), NOW)
    expect(r.filter((s) => s.kind === 'no-next')).toHaveLength(0)
  })
  test('blocked 图还有 todo 不触发（有下一步可推进）', () => {
    const r = suggestNext(scanOf([{ status: 'blocked', mtime: 1 }, { status: 'todo', mtime: 2 }]), NOW)
    expect(r.filter((s) => s.kind === 'no-next')).toHaveLength(0)
  })
  test('blocked 图还有 doing 不触发（在推进中）', () => {
    const r = suggestNext(scanOf([{ status: 'blocked', mtime: 1 }, { status: 'doing', mtime: 2 }]), NOW)
    expect(r.filter((s) => s.kind === 'no-next')).toHaveLength(0)
  })
})

describe('R1 finishOverload（WIP 超载警示变体，看板 WIP limit 口径）', () => {
  test(`doing 严格多于 WIP_WARN（${WIP_WARN}）条：kind 仍 finish，reasonKey 切超载并带计数，task 仍取最新`, () => {
    const r = suggestNext(
      scanOf([
        { status: 'doing', mtime: 1 }, { status: 'doing', mtime: 2 }, { status: 'doing', mtime: 3 }, { status: 'doing', mtime: 4 },
      ]),
      NOW,
    ).filter((s) => s.kind === 'finish')
    expect(r).toHaveLength(1)
    expect(r[0]!.reasonKey).toBe('workbench.suggest.finishOverload')
    expect(r[0]!.count).toBe(4)
    expect(r[0]!.task?.mtime).toBe(4)
  })
  test('恰好 WIP_WARN 条不切超载文案（严格大于边界）', () => {
    const r = suggestNext(
      scanOf([
        { status: 'doing', mtime: 1 }, { status: 'doing', mtime: 2 }, { status: 'doing', mtime: 3 },
      ]),
      NOW,
    ).filter((s) => s.kind === 'finish')
    expect(r).toHaveLength(1)
    expect(r[0]!.reasonKey).toBe('workbench.suggest.finish')
    expect(r[0]!.count).toBeUndefined()
  })
})

describe('规则序与总上限（spec §6 v1.1：R1→R2→R3→R5→R4，上限 6）', () => {
  test('五规则同触发：顺序正确且总数恰为 6', () => {
    const scan = scanOf(
      [
        { status: 'doing', mtime: 10 }, { status: 'todo', mtime: 1 }, { status: 'todo', mtime: 2 },
        { status: 'blocked', mtime: 5, mapName: '图B' },
      ],
      { 图B: NOW - 9 * DAY },
    )
    const r = suggestNext(scan, NOW)
    expect(r.map((s) => s.kind)).toEqual(['finish', 'blocked', 'stale-todo', 'stale-todo', 'no-next', 'stale-map'])
    expect(r).toHaveLength(6)
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

describe('adviceFingerprint（AI 建议缓存指纹，2026-09-14 双条件口径）', () => {
  test('同内容两次构造指纹一致；任务关键字段（状态/文本）变化指纹变', () => {
    const fp = (status: WorkTask['status'], text?: string): string =>
      adviceFingerprint({
        ...scanOf([{ status, mtime: 1 }]),
        tasks: [{ ...scanOf([{ status, mtime: 1 }]).tasks[0]!, text: text ?? `任务0` }],
      })
    expect(fp('todo')).toBe(fp('todo'))
    expect(fp('todo')).not.toBe(fp('doing'))
    expect(fp('todo', '改名')).not.toBe(fp('todo', '任务0'))
  })
  test('mtime 不进指纹（图被动过但任务清单没变，建议仍有效）；任务数变指纹变', () => {
    expect(adviceFingerprint(scanOf([{ status: 'todo', mtime: 1 }]))).toBe(adviceFingerprint(scanOf([{ status: 'todo', mtime: 99 }])))
    expect(adviceFingerprint(scanOf([{ status: 'todo', mtime: 1 }]))).not.toBe(adviceFingerprint(scanOf([{ status: 'todo', mtime: 1 }, { status: 'todo', mtime: 1 }])))
  })
})
