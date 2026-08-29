// src/hooks/useUndoRedo.ts —— 回退/重做状态源（v1.1 撤销/重做，想法5；EditorView 行数护栏拆出）：
// 引擎命令层原生内建 BACK/FORWARD（Render.js:248/251 注册）与 Control+z / Control+y 原生快捷键
// （Command.js:51-57；引擎未注册 Ctrl+Shift+z，画布 window 兜底层补译）。撤销重做走同一命令链：
// backForward 尾随 data_change 携带整树快照（Render.js:745-752）→ 既有置脏/自动保存链捕获，
// 撤销结果随下次保存落盘，无需新链路。
// 禁用态数据源是引擎 back_forward 事件（载荷 activeHistoryIndex / history.length，Command.js
// addHistory/back/forward/clearHistory 四处发出）：canUndo = index > 0，canRedo = index < length - 1。
// bind 在 EditorView onReady 调用（purify 之后）：订阅历史态事件并持有引擎引用（随引擎实例
// 销毁回收，同 useLinkPurify 经 mm.on 的既有模式）；首条编辑可撤销依赖打开时播的基线种子
// （editor/undoSeed.ts，引擎核心不播初始快照——v1.1 核验，engine-api.md）。
import { useRef, useState } from 'react'
import type { MindMapHandle } from '../types/engine'
import { sanitizeTopHistory } from '../editor/undoSeed'

/** 砚栏撤销/重做按钮组（ZenBar 纯展示经此单 prop 透传；形状与按钮一一对应） */
export interface UndoRedo {
  /** 可回退（历史指针非栈底）：btn-undo 禁用信号 */
  canUndo: boolean
  /** 可重做（历史指针非栈顶）：btn-redo 禁用信号 */
  canRedo: boolean
  /** 执行回退（按钮路径；键盘 Ctrl+Z 走引擎原生/画布兜底，不经此处） */
  onUndo(): void
  /** 执行重做（按钮路径；键盘 Ctrl+Y / Ctrl+Shift+Z 同上） */
  onRedo(): void
  /** onReady 时绑定（purify 之后调用）：订阅 back_forward 历史态 + 持有引擎引用 */
  bind(mm: MindMapHandle): void
}

export function useUndoRedo(): UndoRedo {
  const mmRef = useRef<MindMapHandle | null>(null)
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })
  const bind = (mm: MindMapHandle): void => {
    mmRef.current = mm
    mm.on('back_forward', (...args: unknown[]) => {
      // 入史尾随剥栈顶瞬态键（inserting，v1.1 实证污染源）：须在禁用态计算前完成，见 undoSeed.ts ②
      sanitizeTopHistory(mm)
      const index = Number(args[0] ?? 0)
      const length = Number(args[1] ?? 0)
      setFlags({ canUndo: index > 0, canRedo: index < length - 1 })
    })
  }
  const onUndo = (): void => mmRef.current?.execCommand('BACK')
  const onRedo = (): void => mmRef.current?.execCommand('FORWARD')
  return { ...flags, onUndo, onRedo, bind }
}
