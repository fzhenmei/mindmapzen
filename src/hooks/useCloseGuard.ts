// src/hooks/useCloseGuard.ts —— 关闭守卫（M5a 拆分自 EditorView，零行为变化）：
// dirty 时拦截窗口关闭弹三态对话框、三态选择与保存防误触。依赖经 opts 注入——保存分支走
// EditorView 现有 explicitSave 组合函数（忽略门 + 落盘 + 印记）；CloseGuardDialog 渲染留 EditorView。
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { RegisterCloseGuard } from '../types/ports'

export interface CloseGuardOpts {
  /** 关闭守卫注册端口：生产为 Tauri onCloseRequested，测试注入捕获桩 */
  registerCloseGuard: RegisterCloseGuard
  /** 退出应用端口：生产为 getCurrentWindow().destroy()，测试记录调用 */
  exitApp: () => void
  /** 脏标记 ref（EditorView 持有：「放弃」路径也读写它；React 19 类型,current 可变） */
  dirtyRef: RefObject<boolean>
  /** 显式保存统一入口（EditorView 的 explicitSave 组合函数） */
  explicitSave: () => Promise<boolean>
  /** store 脏标记同步清除（useAppStore.clearDirty） */
  clearDirty: () => void
  /** 关闭请求的防抖草稿冲刷（终审 I2，EditorView 注入 bodyPanel 链）：有未提交草稿先落
   *  引擎并返回 true——SET_NODE_DATA 的 data_change 置脏经引擎节流异步到达，守卫不能
   *  依赖冲刷后同步读 dirtyRef，返回 true 即按脏处理走三态 */
  flushPending?: () => boolean
  /** AI 回合关窗锁（Task 12，spec §6）：true 时 preventClose 并回调 onBlocked（状态签
   *  脉冲提示），不走三态框——回合中「保存并关闭」语义复杂，主出路是先点 AI 面板的停止 */
  blockClose?: () => boolean
  /** blockClose 命中时的提示回调（EditorView 注入 chatStore.notifyBlocked） */
  onBlocked?: () => void
  /** 干净关闭接管（2026-09 点子篮子 M2，spec §5.1）：返回 true 时 preventClose 走 exitApp
   *  （快速捕获开启 → hide）。不能放行自然关闭：隐藏的捕获窗会驻留进程，自然关闭留下
   *  僵尸应用（M2 plan R3）；脏态仍优先走三态框 */
  hijackCleanClose?: () => boolean
}

export interface CloseGuard {
  /** 关闭守卫对话框显示（渲染留 EditorView） */
  guarding: boolean
  /** 三态选择回调（CloseGuardDialog onChoice） */
  onGuardChoice(c: 'save' | 'discard' | 'cancel'): Promise<void>
}

export function useCloseGuard(opts: CloseGuardOpts): CloseGuard {
  const { registerCloseGuard, exitApp, dirtyRef, explicitSave, clearDirty, flushPending } = opts
  const [guarding, setGuarding] = useState(false) // 关闭守卫对话框（spec §4 关闭拦截）
  const guardSavingRef = useRef(false) // 守卫保存在途：三态选择一律挡下（见 onGuardChoice）

  // 关闭守卫（spec §4）：dirty 时拦截窗口关闭弹三态对话框；干净则放行自然关闭。
  // 终审 I2：先冲防抖草稿——干净图上防抖窗内直接关窗（Alt+F4/点 X）时 dirty 未及置
  // （data_change 节流异步），flushPending 返回 true 即按脏走三态，草稿不随窗口蒸发
  useEffect(() => {
    const unregister = registerCloseGuard((e) => {
      // AI 回合期间阻止关窗（spec §6）：preventClose + 状态签脉冲提示，不弹三态框
      //（回合中"保存并关闭"语义复杂，主出路是先点 AI 面板的停止）
      if (opts.blockClose?.()) {
        e.preventClose()
        opts.onBlocked?.()
        return
      }
      const flushed = flushPending?.() ?? false
      if (!dirtyRef.current && !flushed) {
        if (opts.hijackCleanClose?.()) {
          e.preventClose()
          opts.exitApp()
        }
        return
      }
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
