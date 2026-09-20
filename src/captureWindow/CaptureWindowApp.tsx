// src/captureWindow/CaptureWindowApp.tsx —— 快速捕获小窗（spec §5.4）：
// - 聚焦刷新（R5）：每次显示重读 cfg——主窗改工作区/篮子路径后小窗自愈，免跨窗状态协议
// - 失焦隐藏但保留草稿（hide 不卸载组件）；Esc / 提交成功同样隐藏
// - 无工作区：窗内提示 +「打开主窗口」（spec §5.4/§7.2）
// - 写入走 store.captureIdea 文件层（本窗 realm 无引擎端口，恒 basketEngine === null）
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { loadConfig } from '../services/config'
import { basketAbsPath, resolveBasketRelPath } from '../services/basket'
import { BASKET_UPDATED_EVENT } from '../services/basketSync'
import QuickCaptureForm from '../components/QuickCaptureForm'
import ToastHost from '../components/ToastHost'

export interface CaptureWindowPorts {
  /** 隐藏本窗（提交成功 / Esc / 失焦；草稿保留——组件不卸载） */
  hide(): void
  /** 跨窗通知（spec §5.5）：写盘成功后 emit，主窗决策静默重载或提示 */
  emitBasketUpdated(mapPath: string): Promise<void>
  /** 无工作区态的「打开主窗口」：显示并聚焦主窗 */
  showMainWindow(): Promise<void>
  /** 窗口焦点订阅（失焦隐藏 / 聚焦刷新）；返回解绑 */
  onFocusChanged(cb: (focused: boolean) => void): Promise<() => void>
}

const tauriPorts: CaptureWindowPorts = {
  hide: () => {
    if (!('__TAURI_INTERNALS__' in window)) return
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().hide())
      .catch((e) => console.error('捕获小窗隐藏失败', e))
  },
  emitBasketUpdated: async (mapPath) => {
    const { emit } = await import('@tauri-apps/api/event')
    await emit(BASKET_UPDATED_EVENT, { mapPath })
  },
  showMainWindow: async () => {
    const { Window } = await import('@tauri-apps/api/window')
    const main = await Window.getByLabel('main')
    if (main === null) return
    await main.show()
    await main.unminimize()
    await main.setFocus()
  },
  onFocusChanged: async (cb) => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    // EventCallback<boolean>：payload 即焦点布尔（v2.11 实际签名，非嵌套 focused 字段）
    return await getCurrentWindow().onFocusChanged(({ payload }) => cb(payload))
  },
}

export default function CaptureWindowApp({ ports = tauriPorts }: Readonly<{ ports?: CaptureWindowPorts }>) {
  const { t } = useTranslation()
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null) // null = 配置读取中

  // 聚焦刷新（R5）：读到什么信什么；读取失败维持现值（boot 已注入过一次），只有明确
  // workspaceDir === null 才进无工作区态——避免 cfg 抖动误清正在输入的会话
  const refresh = useCallback(async () => {
    try {
      const { adapter, configPath } = useAppStore.getState()
      const cfg = await loadConfig(adapter, configPath)
      useAppStore.setState({ workspaceDir: cfg.workspaceDir, basketRelPath: cfg.basketPath })
      setHasWorkspace(cfg.workspaceDir !== null)
    } catch (e) {
      console.error('捕获小窗配置读取失败', e)
      setHasWorkspace(useAppStore.getState().workspaceDir !== null)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  // 失焦隐藏 + 聚焦刷新（spec §5.4）
  useEffect(() => {
    let unref: (() => void) | undefined
    let disposed = false
    void ports
      .onFocusChanged((focused) => {
        if (focused) void refresh()
        else ports.hide()
      })
      .then((fn) => { if (disposed) fn(); else unref = fn })
      .catch((e) => console.error('捕获小窗焦点订阅失败', e))
    return () => { disposed = true; unref?.() }
  }, [ports, refresh])

  // Esc 隐藏（spec §5.4）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ports.hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ports])

  const handleSubmitted = async (): Promise<void> => {
    const { workspaceDir, basketRelPath, resolvedLanguage } = useAppStore.getState()
    if (workspaceDir === null) return
    const rel = basketRelPath ?? resolveBasketRelPath(null, resolvedLanguage)
    try {
      await ports.emitBasketUpdated(basketAbsPath(workspaceDir, rel))
    } catch (e) {
      console.error('跨窗通知失败', e) // 写入已成功，通知失败不阻断隐藏（主窗保存链仍有 mtime 兜底）
    }
    ports.hide()
  }

  let content: React.ReactNode
  if (hasWorkspace === null) {
    content = null // 配置读取中不闪内容
  } else if (!hasWorkspace) {
    content = (
      <div className="flex h-screen flex-col gap-3 bg-background p-5" data-testid="capture-nows">
        <p className="text-sm">{t('basket.capture.noWorkspace')}</p>
        <button
          type="button"
          className="self-start rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
          onClick={() => void ports.showMainWindow()}
        >
          {t('basket.capture.openMain')}
        </button>
      </div>
    )
  } else {
    content = (
      <div className="flex h-screen flex-col gap-2 bg-background p-5">
        <h1 className="text-sm font-medium">{t('basket.capture.title')}</h1>
        <QuickCaptureForm focusOnMount onSubmitted={() => void handleSubmitted()} />
      </div>
    )
  }
  return (
    <>
      {/* ToastHost 必挂：captureIdea 首建篮子时的重建 toast（spec §3.3）在本窗也要有出口 */}
      <ToastHost />
      {content}
    </>
  )
}
