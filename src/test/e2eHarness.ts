import { useAppStore } from '../store/appStore'
import { MemoryFsAdapter } from '../services/fs/MemoryFsAdapter'

/** 仅 E2E 使用（?e2e=1）：以内存文件系统启动并暴露读取钩子。
 *  末尾自动 setWorkspace('/ws')，规避 web 模式下无 Tauri 目录选择对话框的问题。 */
export async function installE2eHarness(): Promise<void> {
  const fs = new MemoryFsAdapter()
  useAppStore.getState().setAdapter(fs)
  useAppStore.setState({ configPath: '/cfg.json' })
  ;(window as unknown as Record<string, unknown>).__zenE2e = {
    async readFile(path: string): Promise<string> {
      return fs.readTextFile(path)
    },
  }
  await useAppStore.getState().setWorkspace('/ws')
}
