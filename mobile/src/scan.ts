import { parsePairingUrl } from './store'

/** 扫码配对依赖注入(测试/mock 与 App 接线分离;spec 2026-09-27 §6) */
export interface ScanDeps {
  /** 原生扫码,返回二维码内容(BarcodeScanner.scanBarcode().ScanResult) */
  scan(): Promise<string>
  setPairing(p: { baseUrl: string; token: string }): void
  onPaired(): void
  toast(key: 'scanFailed'): void
}

/** 扫码 → 解析 → 存配对 → 触发同步;非法/取消返回 false 并 toast(吞异常禁令:出口=toast+console.error) */
export async function scanAndPair(deps: ScanDeps): Promise<boolean> {
  let raw: string
  try {
    raw = await deps.scan()
  } catch (e) {
    console.error('扫码失败/取消', e)
    deps.toast('scanFailed')
    return false
  }
  const p = parsePairingUrl(raw)
  if (p === null) {
    deps.toast('scanFailed')
    return false
  }
  deps.setPairing(p)
  deps.onPaired()
  return true
}
