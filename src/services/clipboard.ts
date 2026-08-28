/** 剪贴板写入端口：EditorView 经 prop 注入，测试环境可替换为内存实现 */
export type WriteClipboard = (text: string) => Promise<void>

/** 生产剪贴板端口：动态引入避免测试环境加载 Tauri 插件 */
export async function writeClipboardViaTauri(text: string): Promise<void> {
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
  await writeText(text)
}
