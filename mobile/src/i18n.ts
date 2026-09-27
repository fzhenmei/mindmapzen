// 极简双语(spec §10):约 15 串,navigator.language 自动选;不引框架
type Key =
  | 'appTitle'
  | 'placeholder'
  | 'capture'
  | 'captured'
  | 'saveFailed'
  | 'deleteFailed'
  | 'delete'
  | 'pendingBanner'
  | 'stateIdle'
  | 'stateSyncing'
  | 'stateSynced'
  | 'stateOffline'
  | 'stateError'
  | 'stateUnauthorized'
  | 'settings'
  | 'pcUrl'
  | 'token'
  | 'save'
  | 'emptyHint'
  | 'scanPair'
  | 'scanFailed'
  | 'paired'
  | 'orManualFill'
  | 'close'

const zh: Record<Key, string> = {
  appTitle: '点子捕获',
  placeholder: '记下这个点子…',
  capture: '记下',
  captured: '已记录',
  saveFailed: '保存失败,内容已保留',
  deleteFailed: '删除失败',
  delete: '删除',
  pendingBanner: '{n} 条待同步 · ',
  stateIdle: '没有待同步的点子',
  stateSyncing: '同步中…',
  stateSynced: '已同步到 PC',
  stateOffline: 'PC 未连接',
  stateError: '同步失败,点此重试',
  stateUnauthorized: '令牌失效,请重新扫码',
  settings: '配对设置',
  pcUrl: 'PC 地址(如 http://192.168.1.10:39871)',
  token: '令牌',
  save: '保存',
  emptyHint: '灵光一现随手记,回家自动同步进 PC 点子篮子',
  scanPair: '扫码配对',
  scanFailed: '不是有效的配对二维码',
  paired: '配对成功',
  orManualFill: '或手动填写',
  close: '关闭',
}

const en: Record<Key, string> = {
  appTitle: 'Idea Capture',
  placeholder: 'Capture this idea…',
  capture: 'Save',
  captured: 'Saved',
  saveFailed: 'Save failed, content kept',
  deleteFailed: 'Delete failed',
  delete: 'Delete',
  pendingBanner: '{n} pending · ',
  stateIdle: 'Nothing to sync',
  stateSyncing: 'Syncing…',
  stateSynced: 'Synced to PC',
  stateOffline: 'PC not reachable',
  stateError: 'Sync failed, tap to retry',
  stateUnauthorized: 'Token invalid, rescan QR',
  settings: 'Pairing',
  pcUrl: 'PC address (e.g. http://192.168.1.10:39871)',
  token: 'Token',
  save: 'Save',
  emptyHint: 'Capture a spark here — it syncs to your PC basket when you get home',
  scanPair: 'Scan to pair',
  scanFailed: 'Not a pairing QR code',
  paired: 'Paired',
  orManualFill: 'Or enter manually',
  close: 'Close',
}

const lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

export function tr(key: Key, vars?: Record<string, string | number>): string {
  let s = (lang === 'zh' ? zh : en)[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
