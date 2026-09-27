import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it } from 'vitest'
import { deleteIdea, listAll, listRecent, openDb, putIdea, removeSynced, type MobileIdea } from './db'

// 库中只存「待同步」(2026-09-27 用户裁定:已同步不保留,推送成功即删除)
const idea = (id: string, text: string): MobileIdea => ({ id, text, body: '', capturedAt: 1 })

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory() // 每用例独立库(fake-indexeddb)
})

it('落盘后全部可列出(库中皆待同步)', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', '点子甲'))
  await putIdea(db, idea('u2', '点子乙'))
  expect((await listAll(db)).map((i) => i.id).sort()).toEqual(['u1', 'u2'])
})

it('removeSynced 批量删除且幂等', async () => {
  const db = await openDb()
  await putIdea(db, idea('u1', 'a'))
  await putIdea(db, idea('u2', 'b'))
  await removeSynced(db, ['u1'])
  expect((await listAll(db)).map((i) => i.id)).toEqual(['u2'])
  await removeSynced(db, ['u1']) // 重复删不抛(推送重试路径)
  expect((await listAll(db)).map((i) => i.id)).toEqual(['u2'])
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
