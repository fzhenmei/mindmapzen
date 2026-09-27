import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it, vi } from 'vitest'
import { listAll, openDb, putIdea, type MobileIdea } from './db'
import { runSync, Unauthorized, type SyncDeps, type SyncEvent } from './sync'

const idea = (id: string, text: string): MobileIdea => ({ id, text, body: '', capturedAt: 1 })

let events: SyncEvent[]
const mkDeps = (over: Partial<SyncDeps>): SyncDeps => ({
  health: async () => true,
  push: async () => new Map(),
  onState: (s, e) => events.push({ state: s, error: e ?? null }),
  onRemoved: () => {},
  ...over,
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() // 每用例独立库(fake-indexeddb)
  events = []
})

it('无待同步走 idle', async () => {
  const db = await openDb()
  await runSync(mkDeps({}), db)
  expect(events).toEqual([{ state: 'idle', error: null }])
})

it('health 不通停 pending', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await runSync(mkDeps({ health: async () => false }), db)
  expect(events).toEqual([{ state: 'pending', error: null }])
})

it('推送成功删本地条目', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await putIdea(db, idea('u2', 'b'))
  const push = vi.fn(async (_b: string, _t: string, ideas: MobileIdea[]) => new Map<string, 'ok' | 'fail'>(ideas.map((i) => [i.id, 'ok' as const])))
  const removed: string[][] = []
  await runSync(mkDeps({ push, onRemoved: (ids) => removed.push(ids) }), db)
  expect(push).toHaveBeenCalledTimes(1)
  expect(removed).toEqual([['u1', 'u2']])
  expect(await listAll(db)).toEqual([]) // 库中即待同步:成功即删,不保留
  expect(events.at(-1)).toEqual({ state: 'synced', error: null })
})

it('部分失败保留失败条目并报 error', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await putIdea(db, idea('u2', 'b'))
  await runSync(
    mkDeps({
      push: async (_b, _t, ideas) => new Map(ideas.map((i) => [i.id, i.id === 'u1' ? ('ok' as const) : ('fail' as const)])),
    }),
    db,
  )
  expect((await listAll(db)).map((i) => i.id)).toEqual(['u2']) // 失败条目留库待重推
  expect(events.at(-1)).toEqual({ state: 'error', error: 'partial' })
})

it('401 走 unauthorized 出口', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await runSync(mkDeps({ push: async () => { throw new Unauthorized() } }), db)
  expect(events.at(-1)).toEqual({ state: 'error', error: 'unauthorized' })
})
