// src/services/contextMenuGuard.ts —— 全局禁用浏览器/WebView 原生右键菜单（想法4）：
// WebView2 默认菜单含"打印"等应用外功能，桌面应用不需要。输入区（input/textarea/contenteditable）
// 保留原菜单——右键"粘贴"等编辑操作仍可用。只 preventDefault 不 stopPropagation：
// 事件继续传播，引擎 svg 的 contextmenu 监听（Event.js）不受影响。
/** 幂等守卫：重复调用不叠加监听（挂载期调一次即可） */
let installed = false

export function disableBrowserContextMenu(target: Window = window): void {
  if (installed) return
  installed = true
  target.addEventListener('contextmenu', (e) => {
    const t = e.target
    if (t instanceof Element && t.closest('input, textarea, [contenteditable="true"]')) return
    e.preventDefault()
  })
}
