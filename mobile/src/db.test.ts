import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it } from 'vitest'
import { clearSynced, deleteIdea, listRecent, listUnsynced, markSynced, openDb, putIdea, type MobileIdea } from './db'

const idea = (id: string, text: string): MobileIdea => ({ id, text, body: '', capturedAt: 1, synced: false })

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory() // 每用例独立库(fake-indexeddb)
})

it('落盘后可列出未同步', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', '点子甲'))
  await putIdea(db, { ...idea('u2', '点子乙'), synced: true })
  const unsynced = await listUnsynced(db)
  expect(unsynced.map((i) => i.id)).toEqual(['u1'])
})

it('标记同步与删除', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await putIdea(db, idea('u2', 'b'))
  await markSynced(db, ['u1', 'u2'])
  expect(await listUnsynced(db)).toEqual([])
  await deleteIdea(db, 'u1')
  expect((await listRecent(db, 10)).map((i) => i.id)).toEqual(['u2'])
})

it('recent 倒序且限量', async () => {
  const db = await openDb()
  for (let i = 0; i < 5; i++) await putIdea(db, { ...idea(`u${i}`, `t${i}`), capturedAt: i })
  const recent = await listRecent(db, 3)
  expect(recent.map((i) => i.id)).toEqual(['u4', 'u3', 'u2'])
})

it('clearSynced 只清已同步', async () => {
  const db = await openDb()
  await putIdea(db, { ...idea('u1', 'a'), synced: true })
  await putIdea(db, idea('u2', 'b'))
  await clearSynced(db)
  expect((await listRecent(db, 10)).map((i) => i.id)).toEqual(['u2'])
})
