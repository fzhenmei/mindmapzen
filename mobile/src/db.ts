import { openDB, type IDBPDatabase } from 'idb'

// 手机捕获本地存储:IndexedDB 只存「待同步」点子——推送成功即删除(removeSynced),
// 重推由 PC 端 id 去重兜底幂等(2026-09-27 用户裁定:已同步不保留)
export interface MobileIdea {
  id: string
  text: string
  body: string
  capturedAt: number
}

const DB_NAME = 'mz-mobile'
const STORE = 'ideas'

export async function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      const s = db.createObjectStore(STORE, { keyPath: 'id' })
      s.createIndex('capturedAt', 'capturedAt')
    },
  })
}

export async function putIdea(db: IDBPDatabase, idea: MobileIdea): Promise<void> {
  await db.put(STORE, idea)
}

/** 库中即待同步全量。(v1 旧数据带 synced 字段,升级后视为待同步重推——PC 端去重,无害) */
export async function listAll(db: IDBPDatabase): Promise<MobileIdea[]> {
  return (await db.getAll(STORE)) as MobileIdea[]
}

/** 推送成功后删除本地条目;重复 id 删除幂等(推送重试路径) */
export async function removeSynced(db: IDBPDatabase, ids: string[]): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function deleteIdea(db: IDBPDatabase, id: string): Promise<void> {
  await db.delete(STORE, id)
}

export async function listRecent(db: IDBPDatabase, limit: number): Promise<MobileIdea[]> {
  const all = (await db.getAll(STORE)) as MobileIdea[]
  return all.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, limit)
}
