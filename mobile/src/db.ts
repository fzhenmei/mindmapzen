import { openDB, type IDBPDatabase } from 'idb'

// 手机捕获本地存储(spec §4.1):IndexedDB 先落盘(离线优先),同步成功才翻转 synced
export interface MobileIdea {
  id: string
  text: string
  body: string
  capturedAt: number
  synced: boolean
}

const DB_NAME = 'mz-mobile'
const STORE = 'ideas'

export async function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      const s = db.createObjectStore(STORE, { keyPath: 'id' })
      // 不建 synced 索引:IndexedDB 索引键不支持 boolean,布尔记录不会入索引
      // (brief 原实现的 getAllFromIndex('synced', 0/1) 恒返回空),过滤走 getAll
      s.createIndex('capturedAt', 'capturedAt')
    },
  })
}

export async function putIdea(db: IDBPDatabase, idea: MobileIdea): Promise<void> {
  await db.put(STORE, idea)
}

export async function listUnsynced(db: IDBPDatabase): Promise<MobileIdea[]> {
  return ((await db.getAll(STORE)) as MobileIdea[]).filter((i) => !i.synced)
}

export async function markSynced(db: IDBPDatabase, ids: string[]): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  await Promise.all(ids.map((id) => tx.store.get(id).then((r) => (r ? tx.store.put({ ...(r as MobileIdea), synced: true }) : undefined))))
  await tx.done
}

export async function deleteIdea(db: IDBPDatabase, id: string): Promise<void> {
  await db.delete(STORE, id)
}

export async function listRecent(db: IDBPDatabase, limit: number): Promise<MobileIdea[]> {
  const all = (await db.getAll(STORE)) as MobileIdea[]
  return all.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, limit)
}

export async function clearSynced(db: IDBPDatabase): Promise<void> {
  const ids = ((await db.getAll(STORE)) as MobileIdea[]).filter((i) => i.synced).map((i) => i.id)
  await Promise.all(ids.map((id) => db.delete(STORE, id)))
}
