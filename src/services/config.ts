import { DEFAULT_CONFIG, type AppConfig, type FsAdapter } from '../types/files'

/** 配置缺失或损坏时回退默认值（spec §8：容错不抛异常） */
export async function loadConfig(fs: FsAdapter, path: string): Promise<AppConfig> {
  try {
    const raw = await fs.readTextFile(path)
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return {
      workspaceDir: typeof parsed.workspaceDir === 'string' ? parsed.workspaceDir : null,
      lastOpened: typeof parsed.lastOpened === 'string' ? parsed.lastOpened : null,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(fs: FsAdapter, path: string, cfg: AppConfig): Promise<void> {
  await fs.writeTextFileAtomic(path, JSON.stringify(cfg, null, 2))
}
