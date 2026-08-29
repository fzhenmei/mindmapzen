import { create } from 'zustand'
import { DEFAULT_COPY_SETTINGS, type CopySettingKey, type CopySettings, type FsAdapter, type LayoutKind, type MapInfo, type ThemePref } from '../types/files'
import { loadConfig, saveConfig } from '../services/config'
import { createMap, listMaps } from '../services/workspace'
import { sweepTmpOrphans } from '../services/tmpSweep'
import { applyDocumentTheme, resolveTheme, type ResolvedTheme } from '../services/theme'

interface AppState {
  route: 'library' | 'editor'
  workspaceDir: string | null
  maps: MapInfo[]
  /** 案头左树当前选中目录（''=全部；相对工作区路径，'/' 分隔）。maps 在 store 中不过滤，由 LibraryView 渲染时派生 */
  selectedDir: string
  currentMdPath: string | null
  dirty: boolean
  error: string | null
  configPath: string
  adapter: FsAdapter
  /** 用户偏好的默认布局（init 自配置；切换布局时更新并持久化） */
  preferredLayout: LayoutKind
  /** 主题三态偏好（auto/亮/暗；init 自配置，切换时持久化） */
  themePref: ThemePref
  /** 解析后的实际主题（auto 按系统偏好解析；驱动 document data-theme） */
  resolvedTheme: ResolvedTheme
  /** 复制行为设置（M5b Task 4：init 自配置，切换时持久化；EditorView 复制时按此后处理） */
  settings: CopySettings
  setAdapter: (fs: FsAdapter) => void
  init: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
  refreshMaps: () => Promise<void>
  setSelectedDir: (rel: string) => void
  createAndOpen: (name: string) => Promise<void>
  openMap: (mdPath: string) => Promise<void>
  setPreferredLayout: (kind: LayoutKind) => Promise<void>
  setThemePref: (p: ThemePref) => Promise<void>
  setSetting: (key: CopySettingKey, value: boolean) => Promise<void>
  markDirty: () => void
  clearDirty: () => void
  backToLibrary: () => Promise<void>
  setError: (e: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  route: 'library',
  workspaceDir: null,
  maps: [],
  selectedDir: '',
  currentMdPath: null,
  dirty: false,
  error: null,
  configPath: '/cfg.json',
  adapter: null as unknown as FsAdapter, // 生产环境在 main.tsx 注入 tauriFsAdapter
  preferredLayout: 'mindmap',
  themePref: 'auto',
  resolvedTheme: 'light',
  settings: DEFAULT_COPY_SETTINGS,

  setAdapter: (fs) => set({ adapter: fs }),

  init: async () => {
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    // 主题先于工作区分支应用（未选工作区也生效）：auto 按系统解析，显式值直出
    const themePref = cfg.theme ?? 'auto'
    const resolved = resolveTheme(themePref)
    set({ preferredLayout: cfg.preferredLayout ?? 'mindmap', themePref, resolvedTheme: resolved, settings: cfg.settings })
    applyDocumentTheme(resolved)
    if (cfg.workspaceDir) {
      set({ workspaceDir: cfg.workspaceDir })
      await get().refreshMaps()
      if (cfg.lastOpened) {
        set({ currentMdPath: cfg.lastOpened, route: 'editor' })
        return
      }
    }
    set({ route: 'library' })
  },

  setWorkspace: async (dir) => {
    const { adapter, configPath } = get()
    // 切换工作区时目录视图回「全部」：新工作区不含旧选中目录
    set({ workspaceDir: dir, selectedDir: '' })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, workspaceDir: dir, lastOpened: get().currentMdPath })
    await get().refreshMaps()
  },

  refreshMaps: async () => {
    const { adapter, workspaceDir } = get()
    if (!workspaceDir) return
    // 案头刷新即清扫原子写孤儿 tmp（编辑器内不触发此路径，无在途写冲突）
    await sweepTmpOrphans(adapter, workspaceDir).catch(() => {})
    set({ maps: await listMaps(adapter, workspaceDir) })
  },

  setSelectedDir: (rel) => set({ selectedDir: rel }),

  createAndOpen: async (name) => {
    const { adapter, workspaceDir, preferredLayout } = get()
    if (!workspaceDir) return
    try {
      const info = await createMap(adapter, workspaceDir, name, preferredLayout)
      set({ currentMdPath: info.mdPath, route: 'editor', error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  /** 记住用户偏好的默认布局（新建/导入/无 sidecar 导图的初始布局），持久化到应用配置 */
  setPreferredLayout: async (kind) => {
    const { adapter, configPath } = get()
    set({ preferredLayout: kind })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, preferredLayout: kind })
  },

  /** 主题三态偏好：即时更新状态并应用到 document，load-merge-save 持久化到应用配置 */
  setThemePref: async (pref) => {
    const { adapter, configPath } = get()
    const resolved = resolveTheme(pref)
    set({ themePref: pref, resolvedTheme: resolved })
    applyDocumentTheme(resolved)
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, theme: pref })
  },

  /** 复制行为设置（M5b Task 4）：即时更新状态，load-merge-save 持久化（单字段合并，不覆盖另一字段） */
  setSetting: async (key, value) => {
    const { adapter, configPath } = get()
    const settings = { ...get().settings, [key]: value }
    set({ settings })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, settings })
  },

  openMap: async (mdPath) => {
    set({ currentMdPath: mdPath, route: 'editor', error: null })
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, lastOpened: mdPath })
  },

  markDirty: () => set({ dirty: true }),
  clearDirty: () => set({ dirty: false }),

  backToLibrary: async () => {
    set({ currentMdPath: null, dirty: false, route: 'library' })
    await get().refreshMaps()
  },

  setError: (e) => set({ error: e }),
}))
