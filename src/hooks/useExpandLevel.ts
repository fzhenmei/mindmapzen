// src/hooks/useExpandLevel.ts —— 展开层级受控值源（一键收起到 N 级，2026-09）：
// ZenBar 层级下拉的 level props 从这里来。engineReady（onCanvasReady 翻真，mmRef 已赋值）
// 后初始读取 statusOps.expandLevelOf，之后双通道跟随展开态变化：
// ① afterExecCommand——展开四命令（SET_NODE_EXPAND / EXPAND_ALL / UNEXPAND_ALL /
//   UNEXPAND_TO_LEVEL，与 MindMapCanvas.EXPAND_COMMANDS 同集，改一处须同步另一处）即时
//   重读（引擎 data_change 经 addHistory 尾随节流且同值可能不重发，不能只靠它）；BACK/
//   FORWARD 也监听——撤销重做恢复整树快照会改展开态；
// ② data_change 带载荷兜底（其余改树路径，如引擎内部调用）；无载荷丢弃（backForward
//   空栈噪声，同 MindMapCanvas.changed 口径）。
// expandLevelOf 幂等只读（纯遍历 renderTree），高频触发无副作用；返回值相同时 React
// 同值 bailout 不产生额外重渲。
import { useEffect, useState, type RefObject } from 'react'
import { expandLevelOf } from '../services/statusOps'
import type { MindMapHandle } from '../types/engine'

/** 即时重读的命令白名单（同 MindMapCanvas EXPAND_COMMANDS 集 + 撤销重做两键） */
const READ_ON_COMMANDS: ReadonlySet<string> = new Set([
  'SET_NODE_EXPAND',
  'EXPAND_ALL',
  'UNEXPAND_ALL',
  'UNEXPAND_TO_LEVEL',
  'BACK',
  'FORWARD',
])

/** 展开层级（'all' 全展开 / n 精确层级 / undefined 混合态或引擎未就绪） */
export function useExpandLevel(
  mmRef: RefObject<MindMapHandle | null>,
  engineReady: boolean,
): number | 'all' | undefined {
  const [level, setLevel] = useState<number | 'all' | undefined>(undefined)
  useEffect(() => {
    if (!engineReady) return
    const mm = mmRef.current
    if (mm === null) return
    const read = (): void => setLevel(expandLevelOf(mm.renderer?.renderTree))
    read()
    const onAfter = (name: unknown): void => {
      if (typeof name === 'string' && READ_ON_COMMANDS.has(name)) read()
    }
    const onChanged = (...args: unknown[]): void => {
      if (args[0] !== undefined) read()
    }
    mm.on('afterExecCommand', onAfter)
    mm.on('data_change', onChanged)
    return () => {
      mm.off('afterExecCommand', onAfter)
      mm.off('data_change', onChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 订阅只沿 engineReady（mm 就绪信号）绑一次；read 闭包持 mm 引用，mmRef.current 渲染期已由 onReady 赋值
  }, [engineReady])
  return level
}
