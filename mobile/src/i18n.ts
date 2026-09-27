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
  | 'installHint'
  | 'settings'
  | 'pcUrl'
  | 'token'
  | 'save'
  | 'clearSynced'
  | 'scanPair'
  | 'scanFailed'

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
  installHint: '首次使用:点下方「扫码配对」,扫电脑端设置里的二维码',
  settings: '配对设置',
  pcUrl: 'PC 地址(如 http://192.168.1.10:39871)',
  token: '令牌',
  save: '保存',
  clearSynced: '清空已同步',
  scanPair: '扫码配对',
  scanFailed: '不是有效的配对二维码',
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
  installHint: 'First time: tap "Scan to pair" and scan the QR on your PC',
  settings: 'Pairing',
  pcUrl: 'PC address (e.g. http://192.168.1.10:39871)',
  token: 'Token',
  save: 'Save',
  clearSynced: 'Clear synced',
  scanPair: 'Scan to pair',
  scanFailed: 'Not a pairing QR code',
}

const lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

export function tr(key: Key, vars?: Record<string, string | number>): string {
  let s = (lang === 'zh' ? zh : en)[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
