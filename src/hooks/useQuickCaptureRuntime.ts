// src/hooks/useQuickCaptureRuntime.ts —— 快速捕获运行时接线（spec §5.1/§5.2/§5.3/§5.5）：
// 快捷键注册/注销（失败双出口）+ 案头路由关窗拦截 + 托盘三键菜单与开关图标联动 +
// 跨窗同步监听（Task 9）。端口注入可测；生产端口全动态 import + internals 守卫
import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { i18n } from '../i18n'
import { showToast } from '../services/toast'
import { showCaptureWindow } from '../services/captureWindow'
import { closeOrHideMainWindow } from '../services/appClose'
import { setTrayEnabled, type TrayActions } from '../services/quickCaptureTray'
import { CAPTURE_WINDOW_LABEL } from '../captureWindow/detect'
import { BASKET_UPDATED_EVENT, planBasketReload } from '../services/basketSync'

/** 默认键位（spec §5.3）：Win/Linux Ctrl+Alt+I；mac Cmd+Option+I。
 *  mac 修饰符别名以注册失败出口实证（Win 为主验证平台，M2 plan R6） */
export const QUICK_CAPTURE_ACCELERATOR = navigator.userAgent.includes('Mac') ? 'Cmd+Alt+I' : 'Ctrl+Alt+I'

export interface QuickCapturePorts {
  registerShortcut(accelerator: string, handler: () => void): Promise<void>
  unregisterShortcut(accelerator: string): Promise<void>
  isShortcutRegistered(accelerator: string): Promise<boolean>
  /** 案头（非编辑器）路由的关窗拦截注册；编辑器路由由 useCloseGuard 接管；返回解绑 */
  registerLibraryCloseGuard(handler: (e: { preventDefault(): void }) => void): Promise<() => void>
  /** 关窗执行（案头拦截路径；默认走 appClose 裁决） */
  closeMainWindow(): void
  /** 托盘开关联动 */
  setTray(enabled: boolean, actions: TrayActions): Promise<void>
  /** 跨窗同步监听（小窗 emit basket-updated） */
  listenBasketUpdated(cb: (mapPath: string) => void): Promise<() => void>
}

const tauriPorts: QuickCapturePorts = {
  registerShortcut: async (accelerator, handler) => {
    const { register } = await import('@tauri-apps/plugin-global-shortcut')
    await register(accelerator, (event) => {
      if (event.state === 'Pressed') handler()
    })
  },
  unregisterShortcut: async (accelerator) => {
    const { unregister } = await import('@tauri-apps/plugin-global-shortcut')
    await unregister(accelerator)
  },
  isShortcutRegistered: async (accelerator) => {
    const { isRegistered } = await import('@tauri-apps/plugin-global-shortcut')
    return await isRegistered(accelerator)
  },
  registerLibraryCloseGuard: async (handler) => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return await getCurrentWindow().onCloseRequested((e) => handler(e))
  },
  closeMainWindow: () => void closeOrHideMainWindow(),
  setTray: setTrayEnabled,
  listenBasketUpdated: async (cb) => {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen<{ mapPath: string }>(BASKET_UPDATED_EVENT, (ev) => cb(ev.payload.mapPath))
  },
}

export function useQuickCaptureRuntime(ports: QuickCapturePorts = tauriPorts): void {
  const enabled = useAppStore((s) => s.quickCaptureEnabled)
  const route = useAppStore((s) => s.route)

  // 快捷键注册/注销（spec §5.3）：失败 toast + 设置内联双出口，不静默降级
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    if (!enabled) {
      void (async () => {
        try {
          if (await ports.isShortcutRegistered(QUICK_CAPTURE_ACCELERATOR)) {
            await ports.unregisterShortcut(QUICK_CAPTURE_ACCELERATOR)
          }
        } catch (e) {
          console.error('全局快捷键注销失败', e)
        }
      })()
      return
    }
    let disposed = false
    void (async () => {
      try {
        await ports.registerShortcut(QUICK_CAPTURE_ACCELERATOR, () => void showCaptureWindow())
        if (!disposed) useAppStore.getState().setQuickCaptureShortcutError(null)
      } catch (e) {
        console.error('全局快捷键注册失败', QUICK_CAPTURE_ACCELERATOR, e)
        if (disposed) return // 卸载后不再 setState/toast（日志出口保留）
        const msg = i18n.t('basket.quickCapture.shortcutFailed')
        useAppStore.getState().setQuickCaptureShortcutError(msg)
        showToast(msg)
      }
    })()
    return () => { disposed = true }
  }, [enabled, ports])

  // 案头路由关窗拦截（spec §5.1）：编辑器路由由 useCloseGuard（hijackCleanClose）接管，
  // 案头无守卫——此处补位；路由切换经 effect 清理/重挂保证两监听器不并存
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window) || route === 'editor') return
    let unref: (() => void) | undefined
    let disposed = false
    void ports
      .registerLibraryCloseGuard((e) => {
        if (!useAppStore.getState().quickCaptureEnabled) return
        e.preventDefault()
        ports.closeMainWindow()
      })
      .then((fn) => { if (disposed) fn(); else unref = fn })
      .catch((e) => console.error('案头关窗拦截注册失败', e))
    return () => { disposed = true; unref?.() }
  }, [route, ports])

  // 跨窗同步（spec §5.5）：小窗写盘成功 emit → 主窗按 planBasketReload 决策
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let unref: (() => void) | undefined
    let disposed = false
    void ports
      .listenBasketUpdated((mapPath) => {
        const st = useAppStore.getState()
        const action = planBasketReload(
          { route: st.route, currentMdPath: st.currentMdPath, dirty: st.dirty },
          { mapPath },
        )
        if (action === 'reload') st.reopenEditor()
        else if (action === 'notify') showToast(i18n.t('basket.sync.updatedInBackground'))
      })
      .then((fn) => { if (disposed) fn(); else unref = fn })
      .catch((e) => console.error('篮子更新监听失败', e))
    return () => { disposed = true; unref?.() }
  }, [ports])

  // 托盘三键（spec §5.2）：显示主窗 / 记点子 / 退出（退出走前端关闭链路——脏态守卫仍
  // 兜底，置 exitRequested 后关窗即真退出，M2 plan R4）
  const trayActions: TrayActions = useMemo(
    () => ({
      onShowMain: () => {
        if (!('__TAURI_INTERNALS__' in window)) return
        void import('@tauri-apps/api/window')
          .then(async ({ getCurrentWindow }) => {
            const w = getCurrentWindow()
            await w.show()
            await w.unminimize()
            await w.setFocus()
          })
          .catch((e) => console.error('显示主窗失败', e))
      },
      onNewIdea: () => void showCaptureWindow(),
      onQuit: () => {
        useAppStore.getState().requestExit()
        if (!('__TAURI_INTERNALS__' in window)) return
        void import('@tauri-apps/api/window')
          .then(({ getCurrentWindow }) => getCurrentWindow().close())
          .catch((e) => console.error('托盘退出失败', e))
      },
    }),
    [],
  )

  // 托盘开关联动（spec §5.2）：禁用路径顺手销毁可能隐藏存活的捕获窗——
  // spec §5.1 关闭=全部还原 / Ruling T6-1 僵尸进程缺口
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    if (!enabled) {
      void (async () => {
        try {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
          const capture = await WebviewWindow.getByLabel(CAPTURE_WINDOW_LABEL)
          if (capture !== null) await capture.destroy()
        } catch (e) {
          console.error('禁用快速捕获时销毁捕获窗失败', e)
        }
      })()
    }
    void ports.setTray(enabled, trayActions).catch((e) => console.error('托盘设置失败', e))
  }, [enabled, ports, trayActions])
}
