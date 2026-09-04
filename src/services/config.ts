import { DEFAULT_CONFIG, parseGitConfig, parseLayoutKind, parsePanelWidth, parsePreviewOutlinePref, parseRecentOpened, parseSettings, parseThemePref, parseTourDone, type AppConfig, type FsAdapter } from '../types/files'

/** 配置缺失或损坏时回退默认值（spec §8：容错不抛异常；旧配置无 preferredLayout 字段按 null、无 theme 按 auto、无 settings 按默认兼容） */
export async function loadConfig(fs: FsAdapter, path: string): Promise<AppConfig> {
  try {
    const raw = await fs.readTextFile(path)
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return {
      workspaceDir: typeof parsed.workspaceDir === 'string' ? parsed.workspaceDir : null,
      lastOpened: typeof parsed.lastOpened === 'string' ? parsed.lastOpened : null,
      preferredLayout: parseLayoutKind(parsed.preferredLayout),
      theme: parseThemePref(parsed.theme),
      previewOutline: parsePreviewOutlinePref(parsed.previewOutline),
      settings: parseSettings(parsed.settings),
      git: parseGitConfig(parsed.git),
      recentOpened: parseRecentOpened(parsed.recentOpened),
      tourDone: parseTourDone(parsed.tourDone),
      sidebarWidth: parsePanelWidth(parsed.sidebarWidth),
      outlineWidth: parsePanelWidth(parsed.outlineWidth),
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(fs: FsAdapter, path: string, cfg: AppConfig): Promise<void> {
  // appDataDir 只返回路径不建目录：先递归创建父目录再写（否则首启写配置 NotFound）
  const parent = path.replace(/[\\/][^\\/]*$/, '')
  await fs.ensureDir(parent)
  await fs.writeTextFileAtomic(path, JSON.stringify(cfg, null, 2))
}
