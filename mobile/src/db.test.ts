import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it } from 'vitest'
import {
  KEEP_SYNCED,
  deleteIdea,
  listAll,
  listRecent,
  listUnsynced,
  markSynced,
  openDb,
  putIdea,
  type MobileIdea,
} from './db'

// 已同步条目保留展示但自动淘汰(2026-09-27 用户裁定:局域网记录需要同步反馈,只留最近 KEEP_SYNCED 条)
const idea = (id: string, text: string): MobileIdea => ({ id, text, body: '', capturedAt: 1, synced: false })

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory() // 每用例独立库(fake-indexeddb)
})

it('落盘后可列出未同步;markSynced 翻标记不删除', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', '点子甲'))
  await putIdea(db, idea('u2', '点子乙'))
  expect((await listUnsynced(db)).map((i) => i.id).sort()).toEqual(['u1', 'u2'])
  await markSynced(db, ['u1'])
  expect((await listUnsynced(db)).map((i) => i.id)).toEqual(['u2'])
  expect((await listAll(db)).map((i) => i.id).sort()).toEqual(['u1', 'u2']) // 已同步仍留库(展示)
})

it('落盘自动淘汰旧已同步,只留最近 KEEP_SYNCED 条;待同步不受影响', async () => {
  const db = await openDb()
  // 12 条依次落盘并同步(capturedAt 递增):淘汰后应只剩最近 KEEP_SYNCED 条已同步
  for (let i = 0; i < 12; i++) {
    const id = `s${i}`
    await putIdea(db, { ...idea(id, `t${i}`), capturedAt: i })
    await markSynced(db, [id])
  }
  // 追加一条待同步触发淘汰
  await putIdea(db, { ...idea('p1', 'pending'), capturedAt: 99 })
  const all = await listAll(db)
  const syncedIds = all.filter((i) => i.synced).map((i) => i.id)
  expect(syncedIds.sort()).toEqual(['s10', 's11', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']) // s2..s11 共 10 条
  expect(all.find((i) => i.id === 'p1')?.synced).toBe(false) // 待同步永不被淘汰
})

it('recent 倒序且限量', async () => {
  const db = await openDb()
  for (let i = 0; i < 5; i++) await putIdea(db, { ...idea(`u${i}`, `t${i}`), capturedAt: i })
  const recent = await listRecent(db, 3)
  expect(recent.map((i) => i.id)).toEqual(['u4', 'u3', 'u2'])
})

it('deleteIdea 删除指定条目', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await deleteIdea(db, 'u1')
  expect(await listAll(db)).toEqual([])
})
