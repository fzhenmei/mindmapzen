import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { showToast } from '../services/toast'
import { i18n } from '../i18n'
import type { BasketIdea } from '../services/basket'

// 手机点子捕获(2026-09-26 spec §5.4):Rust mobile-sync 服务收到点子后
// emit_to('main', 'mobile-ideas', Vec<IdeaIn>)(serde camelCase),前端整批受理:
// 循环复用 captureIdea(就近引擎/文件层/多行约定全部白得),按成功数弹一次 toast。
// fire-and-forget:写入失败走 captureIdea 既有出口(横幅/console),不回传手机。

export const MOBILE_IDEAS_EVENT = 'mobile-ideas'

export interface MobileIdeaIn {
  id: string
  text: string
  body: string
  capturedAt: number
}

/** 整批受理(导出供测试与 e2e harness 直接触发);返回成功条数 */
export async function handleMobileIdeas(ideas: MobileIdeaIn[]): Promise<number> {
  const { captureIdea } = useAppStore.getState()
  let ok = 0
  for (const it of ideas) {
    const idea: BasketIdea = { text: it.text, ...(it.body !== '' ? { body: it.body } : {}) }
    const r = await captureIdea(idea)
    if (r.ok) ok += 1
    // 失败不中断:后续条目照写;失败出口在 captureIdea 内部(错误横幅/console)
  }
  if (ok > 0) showToast(i18n.t('mobileSync.received', { n: ok }))
  return ok
}

/** App 级挂载一次(App.tsx);e2e web 模式无 Tauri 事件,expose 桩供 harness 触发 */
export function useMobileIdeasRuntime(): void {
  useEffect(() => {
    const e2e = new URLSearchParams(window.location.search).has('e2e')
    let un: (() => void) | undefined
    void (async () => {
      if (e2e) {
        const w = window as unknown as {
          __zenE2e?: { mockMobileIdeas?: (ideas: MobileIdeaIn[]) => void }
        }
        w.__zenE2e = w.__zenE2e ?? {}
        w.__zenE2e.mockMobileIdeas = (ideas) => void handleMobileIdeas(ideas)
        return
      }
      try {
        const { listen } = await import('@tauri-apps/api/event')
        un = await listen<MobileIdeaIn[]>(MOBILE_IDEAS_EVENT, (ev) => void handleMobileIdeas(ev.payload))
      } catch (e) {
        console.error('mobile-ideas 事件监听失败', e)
      }
    })()
    return () => un?.()
  }, [])
}
