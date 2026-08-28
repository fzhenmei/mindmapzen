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
