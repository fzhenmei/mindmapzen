import { disableBrowserContextMenu } from './contextMenuGuard'

// 想法4：全局禁用 WebView 原生右键菜单；输入区（粘贴）保留。
// 验证口径：dispatchEvent 返回值 = 是否未 preventDefault，defaultPrevented 直接可断言
function dispatchContextmenu(el: Element): boolean {
  return el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
}

test('普通元素右键被禁用，输入区右键保留', () => {
  disableBrowserContextMenu()
  const div = document.createElement('div')
  const input = document.createElement('input')
  const textarea = document.createElement('textarea')
  const editable = document.createElement('div')
  editable.setAttribute('contenteditable', 'true')
  const inner = document.createElement('span') // 输入区内部子元素同样放行
  editable.appendChild(inner)
  document.body.append(div, input, textarea, editable)

  try {
    expect(dispatchContextmenu(div)).toBe(false) // preventDefault 已调用
    expect(dispatchContextmenu(input)).toBe(true) // 保留：右键粘贴可用
    expect(dispatchContextmenu(textarea)).toBe(true)
    expect(dispatchContextmenu(editable)).toBe(true)
    expect(dispatchContextmenu(inner)).toBe(true)
  } finally {
    div.remove()
    input.remove()
    textarea.remove()
    editable.remove()
  }
})
