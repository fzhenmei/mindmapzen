// src/services/quickCaptureTray.ts —— 托盘图标开关联动（spec §5.2）：JS Tray API（菜单
// action 回调直达前端逻辑，无需 Rust 事件中转）。关闭 = close() 销毁实例（Windows 上
// setIcon(null) 只清图标图像不删条目，残留无图标空白占位且菜单仍可唤出——2026-09-24
// 报障实证）；再开 = 全新创建。actions 由调用方以「间接读 store/调服务」的闭包传入，重建无过期
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
  iconBytes = Uint8Array.from(bin, (c) => c.codePointAt(0) ?? 0)
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
      // 左键 = 打开主窗（Windows 默认左键也弹菜单，显式关掉）；右键仍由 menu 承接。
      // 双击会先来一次 Click 已触发显示，DoubleClick 事件无需处理
      tray = await TrayIcon.new({
        id: 'zen-tray',
        icon: pngBytes(),
        tooltip: 'Mind Map Zen',
        menu,
        showMenuOnLeftClick: false,
        action: (ev) => {
          if (ev.type === 'Click' && ev.button === 'Left') actions.onShowMain()
        },
      })
    }
  } else if (tray !== null) {
    await tray.close() // 真销毁（NIM_DELETE 删条目），spec §5.1：关闭 = 全部还原
    tray = null
  }
}
