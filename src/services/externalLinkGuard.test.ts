// src/services/externalLinkGuard.test.ts —— 全局外链接管守卫(2026-09-27 微信读书链接
// 接管应用报障):vditor 渲染的 <a> 无 target,WebView2 内联导航会把整个应用换成外部
// 网站。守卫在 document 捕获阶段统一接管:非文档内链接一律 preventDefault 走 opener
// 外开。覆盖任意渲染路径(聊天消息/画布悬停窗/案头预览/Portal 浮层)——用例以 body
// 直挂浮层布置链接,即最脱离 React 树的形态(悬停窗同款)
import { beforeEach, expect, test, vi } from 'vitest'
import { subscribeToast } from './toast'
import { guardExternalLinks } from './externalLinkGuard'

// mock 插件 JS 侧(真机授权/外开行为归 e2e);句柄 vi.hoisted 过桥(工厂提升先于模块求值)
const openUrlMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }))

// 守卫幂等(模块级 installed):每用例重复调用不叠加监听,顺带钉死幂等语义。
// mockReset 清实现,补 resolved 默认值(生产 openUrl 返回 Promise,undefined 会让 .catch 炸)
beforeEach(() => {
  openUrlMock.mockReset().mockResolvedValue(undefined)
  guardExternalLinks()
})

/** body 直挂浮层内布置 HTML,对其首元素派发鼠标事件(defaultPrevented 是接管判据) */
function fireAt(html: string, type = 'click', button = 0): MouseEvent {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button })
  host.firstElementChild!.dispatchEvent(ev)
  host.remove()
  return ev
}

test('接管:浮层内 <a> 点击 preventDefault 并走 openUrl(自定义协议同样外开)', () => {
  const ev = fireAt('<a href="weread://book/123">打开阅读</a>')
  expect(ev.defaultPrevented).toBe(true)
  expect(openUrlMock).toHaveBeenCalledWith('weread://book/123')
})

test('接管:https 外链同样拦(ChatPanel 既有语义的全局化)', () => {
  const ev = fireAt('<a href="https://weread.qq.com/web/bookDetail/abc">书详情</a>')
  expect(ev.defaultPrevented).toBe(true)
  expect(openUrlMock).toHaveBeenCalledWith('https://weread.qq.com/web/bookDetail/abc')
})

test('委托:点击 <a> 内嵌子元素沿 closest 命中(vditor 真实产物是嵌套结构)', () => {
  const ev = fireAt('<a href="https://a.example/x"><span><b>加粗文字</b></span></a>')
  expect(ev.defaultPrevented).toBe(true)
  expect(openUrlMock).toHaveBeenCalledWith('https://a.example/x')
})

test('放行:锚点与空 href 是文档内跳转,不拦不外开', () => {
  const anchor = fireAt('<a href="#sec">目录</a>')
  const empty = fireAt('<a href="">空链</a>')
  expect(anchor.defaultPrevented).toBe(false)
  expect(empty.defaultPrevented).toBe(false)
  expect(openUrlMock).not.toHaveBeenCalled()
})

test('放行:非 <a> 元素点击不经过守卫', () => {
  const ev = fireAt('<p>普通文本</p>')
  expect(ev.defaultPrevented).toBe(false)
  expect(openUrlMock).not.toHaveBeenCalled()
})

test('中键:auxclick 同样接管(WebView2 中键新窗口语义也不许在应用内开);非左键 click 放行', () => {
  const aux = fireAt('<a href="https://a.example/y">链接</a>', 'auxclick', 1)
  expect(aux.defaultPrevented).toBe(true)
  expect(openUrlMock).toHaveBeenCalledWith('https://a.example/y')
  // 中键在部分环境派生 click(button=1):守卫只认 button=0 的 click,不重复外开
  const midClick = fireAt('<a href="https://a.example/z">链接</a>', 'click', 1)
  expect(midClick.defaultPrevented).toBe(false)
  expect(openUrlMock).toHaveBeenCalledTimes(1)
})

test('失败出口:openUrl 报错 → console.error + toast(吞异常红线,不静默)', async () => {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    openUrlMock.mockRejectedValueOnce(new Error('url not allowed'))
    const toasts: (string | null)[] = []
    subscribeToast((t) => toasts.push(t?.text ?? null))
    fireAt('<a href="weread://book/1">打开</a>')
    await vi.waitFor(() => expect(toasts).toContain('打开链接失败，请重试'))
    expect(errSpy).toHaveBeenCalled()
  } finally {
    errSpy.mockRestore()
  }
})

test('幂等:重复安装不叠加监听(单次点击只外开一次)', () => {
  guardExternalLinks()
  const ev = fireAt('<a href="https://a.example/w">链接</a>')
  expect(ev.defaultPrevented).toBe(true)
  expect(openUrlMock).toHaveBeenCalledTimes(1)
})
