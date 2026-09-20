// src/captureWindow/boot.tsx —— 捕获小窗引导（spec §5.4）：同一 bundle 按 label 分派到
// 此处，最小引导（适配器 / cfg / i18n / 主题 / store 注入）后挂 CaptureWindowApp。
// 不跑完整 App init：无工作区扫描、无配置迁移（主窗先于小窗存在，迁移归主窗——R7）
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useAppStore } from '../store/appStore'
import { tauriFsAdapter } from '../services/fs/TauriFsAdapter'
import { loadConfig } from '../services/config'
import { initI18n, changeUiLanguage } from '../i18n'
import { resolveUiLang, systemUiLanguage } from '../i18n/resolve'
import { resolveTheme, applyDocumentTheme } from '../services/theme'
import CaptureWindowApp from './CaptureWindowApp'

export async function renderCaptureWindow(): Promise<void> {
  initI18n(resolveUiLang('auto', systemUiLanguage())) // 先按系统预热，cfg 读回后显式校正 UI 语言（initI18n 幂等换不了语言，与主窗 init 同口径）
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const configPath = await join(await appDataDir(), 'config.json')
  const cfg = await loadConfig(tauriFsAdapter, configPath) // 内置宽容回退，不抛
  const lang = resolveUiLang(cfg.language, systemUiLanguage())
  changeUiLanguage(lang) // initI18n 幂等（isInitialized 即返回），cfg 读回须显式切换语言
  useAppStore.setState({
    adapter: tauriFsAdapter,
    configPath,
    workspaceDir: cfg.workspaceDir,
    basketRelPath: cfg.basketPath,
    resolvedLanguage: lang,
  })
  applyDocumentTheme(resolveTheme(cfg.theme))
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <CaptureWindowApp />
    </React.StrictMode>,
  )
}
