// 极简双语(spec §10):约 15 串,navigator.language 自动选;不引框架
type Key =
  | 'appTitle'
  | 'placeholder'
  | 'capture'
  | 'captured'
  | 'saveFailed'
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

const zh: Record<Key, string> = {
  appTitle: '点子捕获',
  placeholder: '记下这个点子…',
  capture: '记下',
  captured: '已记录',
  saveFailed: '保存失败,内容已保留',
  delete: '删除',
  pendingBanner: '{n} 条待同步 · ',
  stateIdle: '没有待同步的点子',
  stateSyncing: '同步中…',
  stateSynced: '已同步到 PC',
  stateOffline: 'PC 未连接',
  stateError: '同步失败,点此重试',
  stateUnauthorized: '令牌失效,请重新扫码',
  installHint: '在浏览器菜单选「添加到主屏幕」,获得图标与离线能力',
  settings: '配对设置',
  pcUrl: 'PC 地址(如 http://192.168.1.10:39871)',
  token: '令牌',
  save: '保存',
  clearSynced: '清空已同步',
}

const en: Record<Key, string> = {
  appTitle: 'Idea Capture',
  placeholder: 'Capture this idea…',
  capture: 'Save',
  captured: 'Saved',
  saveFailed: 'Save failed, content kept',
  delete: 'Delete',
  pendingBanner: '{n} pending · ',
  stateIdle: 'Nothing to sync',
  stateSyncing: 'Syncing…',
  stateSynced: 'Synced to PC',
  stateOffline: 'PC not reachable',
  stateError: 'Sync failed, tap to retry',
  stateUnauthorized: 'Token invalid, rescan QR',
  installHint: 'Use browser menu "Add to Home screen" for icon & offline',
  settings: 'Pairing',
  pcUrl: 'PC address (e.g. http://192.168.1.10:39871)',
  token: 'Token',
  save: 'Save',
  clearSynced: 'Clear synced',
}

const lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

export function tr(key: Key, vars?: Record<string, string | number>): string {
  let s = (lang === 'zh' ? zh : en)[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
