import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { clearSynced, deleteIdea, listRecent, openDb, putIdea, type MobileIdea } from './db'
import { httpSyncDeps, runSync, type SyncDeps } from './sync'
import { autoPairFromUrl, useMobileStore } from './store'
import { scanAndPair } from './scan'
import { tr } from './i18n'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import './App.css'

// openDb 返回 idb 的 IDBPDatabase,按 brief 尾注以推导别名引用(brief 代码中的 IDBDatabase 以此为准)
type MobileDb = Awaited<ReturnType<typeof openDb>>

/** 回车即发送(2026-09-27 手机操作习惯);isComposing 时是输入法候选确认,不发送 */
export function enterSends(e: { key: string; isComposing?: boolean }): boolean {
  return e.key === 'Enter' && e.isComposing !== true
}

// 单屏(spec §4.2):状态条 + 倒序列表(中部滚动) + 底部输入区(手机拇指区,2026-09-27)。
// 打开/回前台/新记录触发同步
export default function App() {
  const [ideas, setIdeas] = useState<MobileIdea[]>([])
  const [draft, setDraft] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const syncState = useMobileStore((s) => s.syncState)
  const syncError = useMobileStore((s) => s.syncError)
  const paired = useMobileStore((s) => s.pairing.token !== '')
  const dbRef = useRef<MobileDb | null>(null)
  const setSyncRef = useRef(useMobileStore.getState().setSync)
  const depsRef = useRef<SyncDeps>({
    ...httpSyncDeps(),
    onState: (s, e) => setSyncRef.current(s, e),
    onRemoved: () => void refresh().catch((e) => console.error('列表刷新失败', e)),
  })

  async function db(): Promise<MobileDb> {
    return (dbRef.current ??= await openDb())
  }

  async function refresh() {
    setIdeas(await listRecent(await db(), 50))
  }

  async function triggerSync() {
    await runSync(depsRef.current, await db())
    await refresh()
  }

  /** 扫码配对(spec 2026-09-27 §6):ZXING 引擎无 GMS 依赖;逻辑在 scan.ts(注入式可测) */
  async function onScanPair(onPaired: () => void) {
    await scanAndPair({
      scan: async () => {
        const r = await CapacitorBarcodeScanner.scanBarcode({
          hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
          android: { scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING },
        })
        return r.ScanResult
      },
      setPairing: (p) => useMobileStore.getState().setPairingManual(p),
      onPaired,
      toast: (k) => useMobileStore.getState().showToast(tr(k)),
    })
  }

  useEffect(() => {
    autoPairFromUrl() // 扫码进入:URL hash 令牌 → localStorage(内部清 hash)
    // 存储回收防护(spec §12):一行成本,申请持久化降低 Android 清理 IndexedDB 概率
    void navigator.storage?.persist?.().catch((e) => console.error('persist 申请失败', e))
    void refresh().catch((e) => console.error('列表刷新失败', e))
    void triggerSync().catch((e) => console.error('同步链路异常', e))
    const onVis = () => {
      if (document.visibilityState === 'visible') void triggerSync().catch((e) => console.error('同步链路异常', e))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次:visibility 监听注册;refresh/triggerSync 闭包只碰稳定量(refs/useState setter),Task 8 review 已核
  }, [])

  async function onCapture() {
    const text = draft.trim()
    if (text === '') return
    const [first, ...rest] = text.split('\n')
    try {
      await putIdea(await db(), { id: uuidv4(), text: first, body: rest.join('\n'), capturedAt: Date.now(), synced: false })
      setDraft('')
      useMobileStore.getState().showToast(tr('captured'))
      await refresh()
      // 顺手试推(spec §4.3);runSync 内部已 catch,这层兜 openDb 等链路 rejection
      void triggerSync().catch((e) => console.error('同步链路异常', e))
    } catch (e) {
      console.error('点子落盘失败', e)
      useMobileStore.getState().showToast(tr('saveFailed')) // 不清空输入(§7 出口)
    }
  }

  const pending = ideas.filter((i) => !i.synced).length
  const stateText =
    syncState === 'error' && syncError === 'unauthorized'
      ? tr('stateUnauthorized')
      : syncState === 'error'
        ? tr('stateError')
        : syncState === 'syncing'
          ? tr('stateSyncing')
          : pending > 0
            ? tr('pendingBanner', { n: pending }) + tr('stateOffline')
            : tr('stateIdle')

  return (
    <div className="app">
      <header className="bar" data-testid="sync-bar" onClick={() => void triggerSync().catch((e) => console.error('同步链路异常', e))}>
        {stateText}
      </header>
      <main className="list">
        {!paired && (
          <div className="hint">
            <p>{tr('installHint')}</p>
            <button
              className="ghost"
              data-testid="btn-scan-pair"
              onClick={() => void onScanPair(() => void triggerSync().catch((e) => console.error('同步链路异常', e)))}
            >
              {tr('scanPair')}
            </button>
          </div>
        )}
        <ul>
          {ideas.map((i) => (
            <li key={i.id} className={i.synced ? 'synced' : ''} data-testid={`idea-${i.id}`}>
              <span className="text">{i.text}</span>
              {!i.synced && (
                <button
                  className="del"
                  onClick={() => {
                    void deleteIdea(dbRef.current!, i.id)
                      .then(refresh)
                      .catch((e) => {
                        console.error('删除/清空失败', e)
                        useMobileStore.getState().showToast(tr('deleteFailed'))
                      })
                  }}
                >
                  {tr('delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button className="ghost" data-testid="btn-settings" onClick={() => setShowSettings((v) => !v)}>
          {tr('settings')}
        </button>
        {showSettings && (
          <SettingsPanel
            scanPair={onScanPair}
            onSaved={() => void triggerSync().catch((e) => console.error('同步链路异常', e))}
            onClear={() => {
              void clearSynced(dbRef.current!)
                .then(refresh)
                .catch((e) => {
                  console.error('删除/清空失败', e)
                  useMobileStore.getState().showToast(tr('deleteFailed'))
                })
            }}
          />
        )}
      </main>
      <footer className="input-area">
        <textarea
          data-testid="idea-input"
          value={draft}
          placeholder={tr('placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (enterSends({ key: e.key, isComposing: e.nativeEvent.isComposing })) {
              e.preventDefault()
              void onCapture()
            }
          }}
          rows={4}
          autoFocus
        />
        <button data-testid="btn-capture" onClick={() => void onCapture()}>
          {tr('capture')}
        </button>
      </footer>
      <Toast />
    </div>
  )
}

function Toast() {
  const toast = useMobileStore((s) => s.toast)
  if (toast === null) return null
  return (
    <div className="toast" data-testid="toast">
      {toast}
    </div>
  )
}

function SettingsPanel({
  scanPair,
  onSaved,
  onClear,
}: {
  /** 扫码配对(App 主入口复用同一实现;手动输入仍是兜底,spec §6.3) */
  scanPair: (onPaired: () => void) => Promise<void>
  onSaved: () => void
  onClear: () => void
}) {
  const { pairing, setPairingManual } = useMobileStore()
  const [url, setUrl] = useState(pairing.baseUrl)
  const [token, setToken] = useState(pairing.token)
  return (
    <div className="panel" data-testid="settings-panel">
      <label>
        {tr('pcUrl')}
        <input data-testid="input-pc-url" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label>
        {tr('token')}
        <input data-testid="input-token" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button
        data-testid="btn-save-pairing"
        onClick={() => {
          setPairingManual({ baseUrl: url.replace(/\/+$/, ''), token })
          onSaved()
        }}
      >
        {tr('save')}
      </button>
      <button
        data-testid="btn-scan-pair-settings"
        onClick={() => {
          void scanPair(onSaved)
        }}
      >
        {tr('scanPair')}
      </button>
      <button data-testid="btn-clear-synced" onClick={onClear}>
        {tr('clearSynced')}
      </button>
    </div>
  )
}
