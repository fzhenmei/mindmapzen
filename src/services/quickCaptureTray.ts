// src/services/quickCaptureTray.ts —— 托盘图标开关联动（spec §5.2）：JS Tray API（菜单
// action 回调直达前端逻辑，无需 Rust 事件中转）。关闭 = setIcon(null) 摘图标（实例与菜单
// 保留）；再开 = 恢复图标。actions 由调用方以「间接读 store/调服务」的闭包传入，重建无过期
import type { TrayIcon } from '@tauri-apps/api/tray'
import { i18n } from '../i18n'
// 应用自有图标（发布合规：OFL/自有资源；拷贝自 src-tauri/icons/32x32.png，Task 4 落位）
import trayIconPng from '../assets/tray-icon.png?inline'

export interface TrayActions {
  onShowMain(): void
  onNewIdea(): void
  onQuit(): void
}

let tray: TrayIcon | null = null
let iconBytes: Uint8Array | null = null

function pngBytes(): Uint8Array {
  if (iconBytes !== null) return iconBytes
  const b64 = trayIconPng.slice(trayIconPng.indexOf(',') + 1)
  const bin = atob(b64)
  iconBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return iconBytes
}

export async function setTrayEnabled(enabled: boolean, actions: TrayActions): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return // jsdom / e2e web 模式无托盘
  const { TrayIcon } = await import('@tauri-apps/api/tray')
  const { Menu } = await import('@tauri-apps/api/menu')
  if (enabled) {
    if (tray === null) {
      const menu = await Menu.new({
        items: [
          { id: 'show-main', text: i18n.t('basket.tray.showMain'), action: () => actions.onShowMain() },
          { id: 'new-idea', text: i18n.t('basket.tray.newIdea'), action: () => actions.onNewIdea() },
          { id: 'quit', text: i18n.t('basket.tray.quit'), action: () => actions.onQuit() },
        ],
      })
      tray = await TrayIcon.new({ id: 'zen-tray', icon: pngBytes(), tooltip: 'Mind Map Zen', menu })
    } else {
      await tray.setIcon(pngBytes()) // 再启用：恢复图标（setIcon(null) 只摘图标）
    }
  } else if (tray !== null) {
    await tray.setIcon(null) // 移除托盘（spec §5.1：关闭 = 全部还原）
  }
}
