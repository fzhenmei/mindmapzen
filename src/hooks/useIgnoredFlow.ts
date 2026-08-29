// src/hooks/useIgnoredFlow.ts —— 未映射块流（M5a 拆分自 EditorView，零行为变化）：
// 解析结果喂入（横幅/确认文案渲染）与显式保存确认门。门只被只绑定一次的 Ctrl+S 闭包经
// refs 调用，逻辑判断必须走 refs（同 dirtyRef 模式）；确认对话框渲染留 EditorView。
import { useRef, useState } from 'react'
import type { IgnoredBlock } from '../types/tree'

export interface IgnoredFlowOpts {
  /** 清防抖自动保存定时器（useSavePipeline.clearPendingAutosave）：确认挂起前暂停自动保存，
   *  防止确认悬而未决时被定时器静默落盘丢弃 */
  clearPendingAutosave: () => void
}

export interface IgnoredFlow {
  /** 未映射块（渲染横幅/确认文案） */
  ignored: IgnoredBlock[]
  /** 打开成功时喂入解析出的未映射块 */
  setFromParse(blocks: IgnoredBlock[]): void
  /** 确认对话框显示 */
  confirming: boolean
  /** 显式保存门：false=需确认（已弹框，须等用户）；true=可直接 saveNow */
  gateExplicitSave(): boolean
  /** 用户确认继续 → 本次会话免确认（落盘由 EditorView 随后调 pipeline.saveNow） */
  confirmProceed(): void
  confirmCancel(): void
}

export function useIgnoredFlow(opts: IgnoredFlowOpts): IgnoredFlow {
  const { clearPendingAutosave } = opts
  const [ignored, setIgnored] = useState<IgnoredBlock[]>([]) // 未映射块（渲染横幅/确认文案）
  const [confirming, setConfirming] = useState(false) // 忽略块保存确认对话框
  // Ctrl+S 监听只绑定一次（EditorView 下方 effect 闭包取首渲染值），逻辑判断必须走 refs（同 dirtyRef 模式）
  const ignoredRef = useRef<IgnoredBlock[]>([])
  const ignoredConfirmedRef = useRef(false) // 本会话确认过一次即不再弹（spec §3.5）

  /** 打开成功喂入：ref 供门判定（闭包稳定可读到最新值），state 供横幅/确认文案渲染 */
  const setFromParse = (blocks: IgnoredBlock[]): void => {
    ignoredRef.current = blocks
    setIgnored(blocks)
  }

  /** 显式保存的忽略门（spec §3.5 实施细化）：有未映射块且本会话未确认过 → 弹确认挂起本次保存，
   *  返回 false（与「保存失败」同义，调用方留在原界面）；确认后由对话框回调直接落盘。
   *  自动保存（5s 防抖定时器）不经此门：每 5 秒弹窗极扰人，裁定静默丢弃（见 EditorView.onTreeDataChange）。 */
  const gateExplicitSave = (): boolean => {
    if (ignoredRef.current.length > 0 && !ignoredConfirmedRef.current) {
      // 等待用户裁决期间暂停自动保存，防止确认悬而未决时被定时器静默落盘丢弃
      clearPendingAutosave()
      setConfirming(true)
      return false
    }
    return true
  }

  /** 用户确认继续 → 收框 + 本会话免确认；落盘由 EditorView 随后执行 */
  const confirmProceed = (): void => {
    setConfirming(false)
    ignoredConfirmedRef.current = true // 本会话确认过一次即不再弹（spec §3.5）
  }

  const confirmCancel = (): void => {
    setConfirming(false)
  }

  return { ignored, setFromParse, confirming, gateExplicitSave, confirmProceed, confirmCancel }
}
