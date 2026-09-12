/** 引擎文本编辑器内的按键不拦截（tagName 判断）；返回是否已处理 */
export function handleEngineKeyDown(
  exec: (cmd: string) => void,
  target: HTMLElement | null,
  key: string,
): boolean {
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return false
  switch (key) {
    case 'Tab':
      exec('INSERT_CHILD_NODE')
      return true
    case 'Enter':
      exec('INSERT_NODE')
      return true
    case 'Delete':
      exec('REMOVE_NODE')
      return true
    default:
      return false
  }
}

/** window 兜底键译上下文（2026-09 看板审查 Important-1 自 MindMapCanvas.onKeydown 提升为
 *  纯函数）：DOM 焦点域由调用方判定注入，本模块不触 DOM——可在 jsdom 直测全部键译分支 */
export interface FallbackKeyContext {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** 焦点在文本输入框（input/textarea/contenteditable）：放行原生输入 */
  inTextInput: boolean
  /** 焦点在对话框内（[role=dialog]）：Radix 焦点陷阱，引擎本就不响应，不补位撤销 */
  inDialog: boolean
  /** 焦点在交互元素（select/button/a）：正常 Tab 导航优先，不译件 */
  inInteractive: boolean
  /** 看板浮层在场（MindMapCanvas 读 appStore.viewMode 注入）：Tab/Enter/Delete 兜底
   *  译件短路——撤销兜底不受此门禁 */
  kanban: boolean
}

/** window 兜底键译总装（自 MindMapCanvas.onKeydown 提升，分支次序保持原实现）：
 *  1) 文本输入框放行（框内原生输入优先）；
 *  2) 撤销/重做兜底（v1.1）——引擎原生 Control+z/y 只认 body 焦点（KeyCommand
 *     defaultEnableCheck），焦点落在砚栏按钮等交互元素时不响应，此处直发命令补位。
 *     **不受看板门禁**：看板浮层夺走 body 焦点后引擎层失活，看板内 Ctrl+Z 撤销正是
 *     靠这条兜底（看板操作是引擎命令，undo 历史共享）；对话框内不补位。Ctrl+Shift+z
 *     同译 FORWARD（编辑类软件惯例；引擎未注册此组合，v1.1 核验）；
 *  3) 看板态门禁（2026-09 审查 Important-1）：看板浮层在场时 Tab/Enter/Delete 若译成
   *   命令会打进被浮层遮住的画布（Delete 不可见删除选中节点、Tab 的 preventDefault
 *     杀死看板键盘导航），一律短路——不译件也不拦截；
 *  4) 交互元素焦点不译件；
 *  5) Tab/Enter/Delete 译件（handleEngineKeyDown）。
 *  返回是否需要 preventDefault */
export function handleCanvasFallbackKey(exec: (cmd: string) => void, c: FallbackKeyContext): boolean {
  if (c.inTextInput) return false
  const k = c.key.toLowerCase()
  if (!c.inDialog && (c.ctrlKey || c.metaKey) && !c.altKey && (k === 'z' || k === 'y')) {
    exec(k === 'y' || c.shiftKey ? 'FORWARD' : 'BACK')
    return true
  }
  if (c.kanban) return false
  if (c.inInteractive) return false
  return handleEngineKeyDown(exec, null, c.key)
}
