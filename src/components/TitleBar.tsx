import { useEffect, useState } from 'react'
import type { Window } from '@tauri-apps/api/window'
import { useAppStore } from '../store/appStore'
import AppLogo from './AppLogo'
import { IconWinClose, IconWinMax, IconWinMin, IconWinRestore } from './icons'

// 顶部条（v2.5 自定义标题栏）：decorations: false 后由应用自绘——左 logo+品名（自案头
// SidebarHeader 上移，系统标题栏与主体不再两处重复）、中拖拽区、右窗口三键。窗口的
// title/图标属性保留给任务栏（预览小窗正常显示）。底色随视图（titlebarBg：案头 sidebar
// 色场 / 编辑器及开屏 background），与视口顶部同色无缝
// Tauri API 全部动态 import + __TAURI_INTERNALS__ 守卫：vitest jsdom / 纯浏览器 dev /
// E2E web 模式无窗口对象，按钮渲染但 no-op（同 App.tsx registerCloseGuard 的模式）

/** 拖拽区说明：data-tauri-drag-region 只在事件 target 是带属性的元素本身时生效，
 *  logo/品名/空白区各自带属性（子元素拦截 target 的地方不可拖，属预期） */
export default function TitleBar() {
  const titlebarBg = useAppStore((s) => s.titlebarBg)
  const [maximized, setMaximized] = useState(false)

  // 最大化态同步（切图标 max/restore）：挂载读一次 + onResized 跟随
  useEffect(() => {
    let unref: (() => void) | null = null
    let done = false
    void (async () => {
      if (!('__TAURI_INTERNALS__' in window)) return
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        if (done) return
        const win = getCurrentWindow()
        setMaximized(await win.isMaximized())
        unref = await win.onResized(() => void win.isMaximized().then(setMaximized))
        if (done) unref()
      } catch {
        // 非 Tauri 环境：无窗口事件源
      }
    })()
    return () => {
      done = true
      unref?.()
    }
  }, [])

  /** 窗口动作（最小化/最大化还原/关闭）。close 走 onCloseRequested 事件，
   *  由 App 注册的关闭守卫统一拦截（未保存提示），与系统 Alt+F4 同路径 */
  const winAction = (fn: (win: Window) => Promise<unknown>) => () => {
    if (!('__TAURI_INTERNALS__' in window)) return
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => fn(getCurrentWindow()))
      .catch(() => {})
  }

  const btn =
    'flex h-8 w-[46px] items-center justify-center text-foreground/70 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring'

  return (
    <header
      className={`flex h-8 shrink-0 select-none items-center ${
        titlebarBg === '--sidebar' ? 'bg-sidebar text-sidebar-foreground' : 'bg-background text-foreground'
      }`}
      data-testid="titlebar"
    >
      <div className="flex items-center gap-2 px-2" data-tauri-drag-region>
        <AppLogo size={16} className="shrink-0" />
        <span className="text-sm font-semibold" data-tauri-drag-region>
          Mind Map Zen
        </span>
      </div>
      <div className="h-full flex-1" data-tauri-drag-region />
      <button
        type="button"
        className={btn}
        data-testid="btn-win-min"
        aria-label="最小化"
        onClick={winAction((w) => w.minimize())}
      >
        <IconWinMin />
      </button>
      <button
        type="button"
        className={btn}
        data-testid="btn-win-max"
        aria-label={maximized ? '还原' : '最大化'}
        onClick={winAction((w) => w.toggleMaximize())}
      >
        {maximized ? <IconWinRestore /> : <IconWinMax />}
      </button>
      <button
        type="button"
        className="flex h-8 w-[46px] items-center justify-center text-foreground/70 hover:bg-[#C42B1C] hover:text-white focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="btn-win-close"
        aria-label="关闭"
        onClick={winAction((w) => w.close())}
      >
        <IconWinClose />
      </button>
    </header>
  )
}
