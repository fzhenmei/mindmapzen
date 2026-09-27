import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setPairing } from './sync'

// 配对持久化 localStorage(spec §4.2):扫码 URL 的 hash 令牌首次自动截取
interface Pairing {
  baseUrl: string
  token: string
}

interface MobileState {
  pairing: Pairing
  setPairingManual: (p: Pairing) => void
  syncState: 'idle' | 'pending' | 'syncing' | 'synced' | 'error'
  syncError: string | null
  setSync: (s: MobileState['syncState'], error?: string) => void
  toast: string | null
  showToast: (t: string) => void
}

export const useMobileStore = create<MobileState>()(
  persist(
    (set) => ({
      pairing: { baseUrl: '', token: '' },
      setPairingManual: (p) => {
        // 持久化只走 persist(set 即落盘 {"state":{"pairing":…}}):手写裸格式
        // setItem 与 persist 格式冲突,曾靠写入时序侥幸不被读回(2026-09-27 移除)
        setPairing(p)
        set({ pairing: p })
      },
      syncState: 'idle',
      syncError: null,
      // brief 写法 syncError = null 与 error?: string 形参类型冲突(TS strict),改 ?? null 语义等价
      setSync: (syncState, syncError) => set({ syncState, syncError: syncError ?? null }),
      toast: null,
      showToast: (toast) => {
        set({ toast })
        window.setTimeout(() => set({ toast: null }), 1600)
      },
    }),
    {
      name: 'mz-pairing',
      partialize: (s) => ({ pairing: s.pairing }),
      onRehydrateStorage: () => (state) => {
        if (state) setPairing(state.pairing)
      },
    },
  ),
)

/** 配对二维码 URL(http://ip:port/#token)→ {baseUrl, token};非法输入返回 null
 * (App 扫码与浏览器 hash 自动配对共用;spec 2026-09-27 §6) */
export function parsePairingUrl(url: string): { baseUrl: string; token: string } | null {
  try {
    const u = new URL(url)
    const token = u.hash.replace(/^#/, '')
    if (token === '' || !/^https?:$/.test(u.protocol)) return null
    return { baseUrl: u.origin, token }
  } catch {
    return null
  }
}

/** 扫码进入的 URL 形如 http://ip:port/#<token>:首次自动配对(spec §4.2) */
export function autoPairFromUrl(): boolean {
  const p = parsePairingUrl(window.location.href)
  if (p === null) return false
  useMobileStore.getState().setPairingManual(p)
  history.replaceState(null, '', '/')
  return true
}
