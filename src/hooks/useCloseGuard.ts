// src/hooks/useCloseGuard.ts —— 关闭守卫（M5a 拆分自 EditorView，零行为变化）：
// dirty 时拦截窗口关闭弹三态对话框、三态选择与保存防误触。依赖经 opts 注入——保存分支走
// EditorView 现有 explicitSave 组合函数（忽略门 + 落盘 + 印记）；CloseGuardDialog 渲染留 EditorView。
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { RegisterCloseGuard } from '../types/ports'

export interface CloseGuardOpts {
  /** 关闭守卫注册端口：生产为 Tauri onCloseRequested，测试注入捕获桩 */
  registerCloseGuard: RegisterCloseGuard
  /** 退出应用端口：生产为 getCurrentWindow().destroy()，测试记录调用 */
  exitApp: () => void
  /** 脏标记 ref（EditorView 持有：「放弃」路径也读写它） */
  dirtyRef: MutableRefObject<boolean>
  /** 显式保存统一入口（EditorView 的 explicitSave 组合函数） */
  explicitSave: () => Promise<boolean>
  /** store 脏标记同步清除（useAppStore.clearDirty） */
  clearDirty: () => void
}

export interface CloseGuard {
  /** 关闭守卫对话框显示（渲染留 EditorView） */
  guarding: boolean
  /** 三态选择回调（CloseGuardDialog onChoice） */
  onGuardChoice(c: 'save' | 'discard' | 'cancel'): Promise<void>
}

export function useCloseGuard(opts: CloseGuardOpts): CloseGuard {
  const { registerCloseGuard, exitApp, dirtyRef, explicitSave, clearDirty } = opts
  const [guarding, setGuarding] = useState(false) // 关闭守卫对话框（spec §4 关闭拦截）
  const guardSavingRef = useRef(false) // 守卫保存在途：三态选择一律挡下（见 onGuardChoice）

  // 关闭守卫（spec §4）：dirty 时拦截窗口关闭弹三态对话框；干净则放行自然关闭
  useEffect(() => {
    const unregister = registerCloseGuard((e) => {
      if (!dirtyRef.current) return
      e.preventClose()
      setGuarding(true)
    })
    return unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载期注册一次，端口经 props 注入且稳定
  }, [])

  /** 三态选择：取消→收起；放弃→清脏直退；保存→走 explicitSave 落盘成功才退。
   *  guardSavingRef 防误触：保存一旦在途，三态（含取消/放弃）一律挡下——收框会与在途落盘竞态，
   *  放弃清脏直退更会在写盘未完成时销毁窗口（数据丢失）；连点保存同理绕过等待提前 exitApp。
   *  explicitSave 返回 false 的两种情形同路处理（收起守卫对话框留在应用）：保存失败（横幅已提示）；
   *  忽略块确认挂起——由确认对话框接管，确认后仅落盘不退出，用户需再次关闭窗口（不静默退出/丢弃，spec §3.5 细化）。 */
  const onGuardChoice = async (c: 'save' | 'discard' | 'cancel'): Promise<void> => {
    if (guardSavingRef.current) return // 保存动作在途：本轮对话框冻结，任何选择都不生效
    if (c === 'cancel') {
      setGuarding(false)
      return
    }
    if (c === 'discard') {
      dirtyRef.current = false
      clearDirty() // store 脏标记同步清除：exitApp 失败窗口留下时，避免"● 显示未保存但保存 no-op"的僵尸态
      setGuarding(false)
      exitApp()
      return
    }
    guardSavingRef.current = true
    const ok = await explicitSave()
    guardSavingRef.current = false
    if (!ok) {
      setGuarding(false)
      return
    }
    setGuarding(false)
    exitApp()
  }

  return { guarding, onGuardChoice }
}
