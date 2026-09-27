import { listAll, removeSynced, type MobileIdea } from './db'

// 同步状态机(spec §4.3):open/前台/新记录/手动触发时调用;失败不自动退避(等下次触发)
export type SyncState = 'idle' | 'pending' | 'syncing' | 'synced' | 'error'

export interface SyncEvent {
  state: SyncState
  error: string | null
}

export class Unauthorized extends Error {}

export interface SyncDeps {
  /** GET /api/health,3s 超时;false = PC 不在线 */
  health(base: string): Promise<boolean>
  /** POST /api/ideas(Bearer);返回逐条 'ok' | 'fail';401 抛 Unauthorized */
  push(base: string, token: string, ideas: MobileIdea[]): Promise<Map<string, 'ok' | 'fail'>>
  onState(state: SyncState, error?: string): void
  /** 已从库中删除的条目 id(2026-09-27 语义:推送成功即删,不保留) */
  onRemoved(ids: string[]): void
}

export async function runSync(deps: SyncDeps, db: Parameters<typeof listAll>[0]): Promise<void> {
  const unsynced = await listAll(db)
  if (unsynced.length === 0) {
    deps.onState('idle')
    return
  }
  if (!(await deps.health(pcBaseUrl()))) {
    deps.onState('pending')
    return
  }
  deps.onState('syncing')
  let results: Map<string, 'ok' | 'fail'>
  try {
    results = await deps.push(pcBaseUrl(), pcToken(), unsynced)
  } catch (e) {
    if (e instanceof Unauthorized) {
      deps.onState('error', 'unauthorized')
    } else {
      console.error('同步推送失败', e)
      deps.onState('error', 'network')
    }
    return
  }
  const okIds = [...results].filter(([, v]) => v === 'ok').map(([id]) => id)
  if (okIds.length > 0) {
    await removeSynced(db, okIds)
    deps.onRemoved(okIds)
  }
  if (okIds.length === unsynced.length) {
    deps.onState('synced')
  } else {
    deps.onState('error', 'partial')
  }
}

// ---- 配对存取(模块级,Task 8 的 store 注入值;默认读 localStorage)----

let pairingOverride: { baseUrl: string; token: string } | null = null

/** 测试/注入用;生产由 store 启动时调用 */
export function setPairing(p: { baseUrl: string; token: string } | null): void {
  pairingOverride = p
}

/** 当前生效配对(override 优先,回落 localStorage);导出供测试断言 */
export function currentPairing(): { baseUrl: string; token: string } {
  return pairingOverride ?? readStored()
}

function pcBaseUrl(): string {
  return currentPairing().baseUrl
}

function pcToken(): string {
  return currentPairing().token
}

/** 唯一合法落盘格式是 zustand persist 的 {"state":{"pairing":{…}},"version":0};
 * 兼容解析历史裸格式;导出供测试断言 */
export function readStored(): { baseUrl: string; token: string } {
  try {
    const raw = localStorage.getItem('mz-pairing')
    if (raw) {
      const v = JSON.parse(raw) as { state?: { pairing?: { baseUrl?: unknown; token?: unknown } }; baseUrl?: unknown; token?: unknown }
      const p = v.state?.pairing ?? v
      if (typeof p.token === 'string') {
        return { baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : '', token: p.token }
      }
    }
  } catch (e) {
    console.error('配对信息读取失败', e)
  }
  return { baseUrl: '', token: '' }
}

// ---- 生产 HTTP 实现 ----

export function httpSyncDeps(): Pick<SyncDeps, 'health' | 'push'> {
  return {
    health: async (base) => {
      if (base === '') return false
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), 3000)
        const r = await fetch(`${base}/api/health`, { signal: ctl.signal })
        clearTimeout(t)
        return r.ok
      } catch {
        // 探测失败只意味着 PC 不在线,属正常路径,返回 false 即可
        return false
      }
    },
    push: async (base, token, ideas) => {
      const r = await fetch(`${base}/api/ideas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideas: ideas.map((i) => ({ id: i.id, text: i.text, body: i.body, capturedAt: i.capturedAt })) }),
      })
      if (r.status === 401) throw new Unauthorized('令牌失效')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { results: { id: string; ok: boolean }[] }
      return new Map(data.results.map((x) => [x.id, x.ok ? ('ok' as const) : ('fail' as const)]))
    },
  }
}
