// src/services/externalLinkGuard.ts —— 全局外链接管守卫(2026-09-27 微信读书链接接管
// 应用报障):vditor 渲染的 <a> 不带 target,WebView2 里点击即内联导航,整个前端应用被
// 外部网站替换(无边框窗的关闭钮在前端,一并消失)。此前只有 ChatPanel 消息列表一处
// 局部拦截,画布悬停窗/案头预览/正文弹窗等渲染路径裸奔。守卫挂 document 捕获阶段,
// 任意容器(含 Portal 浮层)全覆盖:非文档内链接一律 preventDefault 走 opener 外开
// ——http(s) 交系统浏览器,自定义协议(weread:// 等)走 OS ShellExecute。锚点/空 href
// 是文档内跳转,放行。宿主侧另有 on_navigation 白名单兜底(漏网导航在 Rust 层拒绝),
// 本守卫是第一道:体验与失败反馈(toast)都在这层
import { openUrl } from '@tauri-apps/plugin-opener'
import { i18n } from '../i18n'
import { showToast } from './toast'

/** 幂等守卫:重复调用不叠加监听(挂载期调一次即可,同 contextMenuGuard 先例) */
let installed = false

export function guardExternalLinks(target: Window = window): void {
  if (installed) return
  installed = true
  const handle = (e: Event): void => {
    const me = e as MouseEvent
    // click 只认左键;auxclick 只认中键(新窗口语义)——右键 contextmenu 不导航,非目标
    if (me.button !== (e.type === 'click' ? 0 : 1)) return
    const t = e.target
    if (!(t instanceof Element)) return
    const a = t.closest('a')
    if (a === null) return
    const href = a.getAttribute('href') ?? ''
    if (href === '' || href.startsWith('#')) return
    e.preventDefault()
    // 事件回调里的异步异常框架会静默吞(吞异常红线):console + toast 双出口
    void openUrl(href).catch((err: unknown) => {
      console.error('外部链接打开失败', err)
      showToast(i18n.t('common.openLinkFailed'))
    })
  }
  target.addEventListener('click', handle, true)
  target.addEventListener('auxclick', handle, true)
}
