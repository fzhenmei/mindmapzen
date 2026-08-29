import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

/** 仅 E2E 使用（?e2e=1）：以内存文件系统启动并暴露读取钩子。
 *  末尾自动 setWorkspace('/ws')，规避 web 模式下无 Tauri 目录选择对话框的问题。
 *  ?desk=1 追加班头预置（/ws/项目/项目图.md + /ws/根图.md）：仅 desk.spec 使用——
 *  预置须先于 setWorkspace 写盘（refreshMaps/左树在 setWorkspace 时生成），
 *  且不能无条件预置：多卡片会破坏既有用例对 map-item 的单例（严格模式）断言 */
export async function installE2eHarness(): Promise<void> {
  const fs = new MemoryFsAdapter()
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ configPath: '/cfg.json' })
  ;(window as unknown as Record<string, unknown>).__zenE2e = {
    async readFile(path: string): Promise<string> {
      return fs.readTextFile(path)
    },
    // 剪贴板桩：App E2E 装配的 writeClipboard 将复制内容记录于此，供 spec 断言
    lastCopied: null as string | null,
    // 导出端口桩（M5b Task 5）：App E2E 装配的 pickSavePath 记录导出路径；
    // writeImage 记录图片字节长度（exportedBytes > 0 断言）
    savePaths: [] as string[],
    exportedBytes: null as number | null,
    // 导入文件桩：固定返回内置样例（含 1 个忽略块「忽略段。」），App E2E 分支读取
    async pickMdFile(): Promise<{ name: string; text: string } | null> {
      return { name: '外部图', text: '# 外部图\n\n忽略段。\n\n## A\n' }
    },
  }
  if (new URLSearchParams(window.location.search).has('desk')) {
    await fs.mkdir('/ws/项目')
    await fs.writeTextFileAtomic('/ws/项目/项目图.md', '# 项目图\n')
    await fs.writeTextFileAtomic('/ws/根图.md', '# 根图\n')
  }
  await useAppStore.getState().setWorkspace('/ws')
}
