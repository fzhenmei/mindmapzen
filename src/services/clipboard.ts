/** 剪贴板写入端口：EditorView 经 prop 注入，测试环境可替换为内存实现 */
export type WriteClipboard = (text: string) => Promise<void>

/** 生产剪贴板端口：动态引入避免测试环境加载 Tauri 插件 */
export async function writeClipboardViaTauri(text: string): Promise<void> {
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
  await writeText(text)
}

/** 富文本剪贴板写入端口(公众号格式 HTML,text/html 形态)：同 writeText 的端口风格,
 *  调用方(wechatCopy 编排/LibraryView)注入,测试环境可替换 */
export type WriteHtmlClipboard = (html: string) => Promise<void>

/** 生产富文本剪贴板端口:Tauri clipboard-manager writeHtml(插件 2.3.2 起) */
export async function writeHtmlClipboardViaTauri(html: string): Promise<void> {
  const { writeHtml } = await import('@tauri-apps/plugin-clipboard-manager')
  await writeHtml(html)
}
