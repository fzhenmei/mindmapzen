import { openDB, type IDBPDatabase } from 'idb'

// 手机捕获本地存储:待同步全量留存;已同步条目保留展示但自动淘汰——只留最近
// KEEP_SYNCED 条(2026-09-27 用户裁定:局域网记录需要"已记好"的反馈,历史不必全留)
export interface MobileIdea {
  id: string
  text: string
  body: string
  capturedAt: number
  synced: boolean
}

/** 已同步条目保留上限(超出按 capturedAt 淘汰最旧) */
export const KEEP_SYNCED = 10

const DB_NAME = 'mz-mobile'
const STORE = 'ideas'

export async function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      const s = db.createObjectStore(STORE, { keyPath: 'id' })
      // 不建 synced 索引:IndexedDB 索引键不支持 boolean,过滤走 getAll
      s.createIndex('capturedAt', 'capturedAt')
    },
  })
}

/** 淘汰超出上限的旧已同步(putIdea/markSynced 后调用,同步标记一多立即收敛) */
async function pruneSynced(db: IDBPDatabase): Promise<void> {
  const all = (await db.getAll(STORE)) as MobileIdea[]
  const synced = all.filter((i) => i.synced).sort((a, b) => b.capturedAt - a.capturedAt)
  const drop = synced.slice(KEEP_SYNCED).map((i) => i.id)
  await Promise.all(drop.map((id) => db.delete(STORE, id)))
}

export async function putIdea(db: IDBPDatabase, idea: MobileIdea): Promise<void> {
  await db.put(STORE, idea)
  await pruneSynced(db)
}

export async function listAll(db: IDBPDatabase): Promise<MobileIdea[]> {
  return (await db.getAll(STORE)) as MobileIdea[]
}

export async function listUnsynced(db: IDBPDatabase): Promise<MobileIdea[]> {
  return ((await db.getAll(STORE)) as MobileIdea[]).filter((i) => !i.synced)
}

export async function markSynced(db: IDBPDatabase, ids: string[]): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  await Promise.all(ids.map((id) => tx.store.get(id).then((r) => (r ? tx.store.put({ ...(r as MobileIdea), synced: true }) : undefined))))
  await tx.done
  await pruneSynced(db)
}

export async function deleteIdea(db: IDBPDatabase, id: string): Promise<void> {
  await db.delete(STORE, id)
}

export async function listRecent(db: IDBPDatabase, limit: number): Promise<MobileIdea[]> {
  const all = (await db.getAll(STORE)) as MobileIdea[]
  return all.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, limit)
}
