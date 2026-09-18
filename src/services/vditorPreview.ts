// src/services/vditorPreview.ts —— VDitor 纯渲染封装(2026-09 渲染统一):弹窗编辑器
// 预览、案头详情、画布悬停窗三处 md 渲染统一走 lute 管线(VDitor.preview 官方静态
// 渲染 API,不建编辑器)。cdn 指向 vite-plugin-static-copy 本地化的 vendor 资源,
// Tauri 离线可用;mermaid 成图由 vditor dist 自带资源驱动(项目 mermaid 包退役)。
import Vditor from 'vditor'

/** VDitor 子资源根:VDitor 内部拼 `${cdn}/dist/js|css/...`,vite staticCopy 把
 *  node_modules/vditor/dist 内容拷到 vendor/vditor/dist(vite.config.ts) */
export const VDITOR_CDN = 'vendor/vditor'

/** md 渲染进容器(异步:首次动态加载 lute/样式,其后 vditor 内部缓存复用)。
 *  注:静态 VDitor.preview 不渲染预览区导出工具条(actions 配置仅编辑器构造
 *  消费,弹窗侧在 VditorEditor 里置空;2026-09-09 实测 method.js 无此逻辑),
 *  故本服务无需也无法配置 actions。
 *  hljs 显式关闭:vditor 自带 highlightRender 有自毒化循环——高亮成功即给 code 挂
 *  hljs 类,下一轮朴素语言提取(className.replace("language-","") → "ts hljs")
 *  查表必败回退 plaintext,把已上的色抹掉(2026-09 实测内部连跑 5 轮全数回退)。
 *  高亮 CSS 仍会加载;token 由调用方走 codeHighlight 自管 pass(案头预览)或
 *  发布复制管线,不挂 hljs 类、无后续轮次,永不回退 */
export function renderVditorPreview(el: HTMLElement, markdown: string, theme: 'light' | 'dark'): Promise<void> {
  // vditor 4.0 类型声明 preview 首参收 HTMLDivElement;本服务对外契约(下游任务消费)
  // 是更宽的 HTMLElement,故在此收窄断言,容器是普通 div 时运行时等价
  return Vditor.preview(el as HTMLDivElement, markdown, {
    cdn: VDITOR_CDN,
    mode: theme === 'dark' ? 'dark' : 'light',
    // content-theme 必须显式随主题切(2026-09 暗色文字不可见修复):静态 preview 的
    // mode 只喂 mermaid/chart 等图渲染器,文字/表格配色由 setContentTheme(theme.current)
    // 驱动且默认恒 'light'——不传则夜航下加载 light.css,bundle 内 vditor index.css 的
    // .vditor-reset{color:#24292e} 压场,暗底墨字不可见(此前被 light.css 白底行半遮)。
    // path 由 mergeOptions 依 cdn 自动补全
    theme: { current: theme === 'dark' ? 'dark' : 'light' },
    // preview 的 hljs 开关在顶层选项(md2html 的 lute 配置才是 markdown.*),深合并
    hljs: { enable: false },
  })
}

/** 插图 src 解析(M19 沿用):命中 imgMap 换 dataURL(webview 解析不了工作区相对路径),
 *  未命中的(外链 http 等)原样 */
export function applyImageMap(root: ParentNode, imgMap: ReadonlyMap<string, string>): void {
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src')
    if (src !== null && imgMap.has(src)) img.src = imgMap.get(src) as string
  }
}

/** 大纲锚点注入:mdOutline(remark)与 lute 是两套解析器,DOM 标题数与大纲一致才按
 *  文档序配对注入 zen-h-N(与 OutlinePanel 点击跳转对齐);数量不等(如 HTML 块内
 *  标题的解析器分歧)保守跳过——大纲点击无锚点,不跳错位。
 *  引用块(=正文块)内标题先过滤:mdOutline 只遍历 AST 顶层,`> # x` 不进大纲,
 *  lute 却渲染成 blockquote>h1——不过滤则数量被顶飞、守卫整档跳过,真顶层标题
 *  锚点也丢;过滤后两端口径一致(引用块不算大纲层级) */
export function injectHeadingAnchors(root: ParentNode, headings: readonly { id: string }[]): void {
  const els = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(
    (el) => el.closest('blockquote') === null,
  )
  if (els.length !== headings.length) return
  els.forEach((el, i) => {
    el.id = headings[i].id
  })
}
