import { create } from 'zustand'
import type { FsAdapter, MapInfo } from '../types/files'
import { loadConfig, saveConfig } from '../services/config'
import { createMap, listMaps } from '../services/workspace'

interface AppState {
  route: 'library' | 'editor'
  workspaceDir: string | null
  maps: MapInfo[]
  currentMdPath: string | null
  dirty: boolean
  error: string | null
  configPath: string
  adapter: FsAdapter
  setAdapter: (fs: FsAdapter) => void
  init: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
  refreshMaps: () => Promise<void>
  createAndOpen: (name: string) => Promise<void>
  openMap: (mdPath: string) => Promise<void>
  markDirty: () => void
  clearDirty: () => void
  backToLibrary: () => Promise<void>
  setError: (e: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  route: 'library',
  workspaceDir: null,
  maps: [],
  currentMdPath: null,
  dirty: false,
  error: null,
  configPath: '/cfg.json',
  adapter: null as unknown as FsAdapter, // 生产环境在 main.tsx 注入 tauriFsAdapter

  setAdapter: (fs) => set({ adapter: fs }),

  init: async () => {
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
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
    set({ workspaceDir: dir })
    await saveConfig(adapter, configPath, { workspaceDir: dir, lastOpened: get().currentMdPath })
    await get().refreshMaps()
  },

  refreshMaps: async () => {
    const { adapter, workspaceDir } = get()
    if (!workspaceDir) return
    set({ maps: await listMaps(adapter, workspaceDir) })
  },

  createAndOpen: async (name) => {
    const { adapter, workspaceDir } = get()
    if (!workspaceDir) return
    try {
      const info = await createMap(adapter, workspaceDir, name)
      set({ currentMdPath: info.mdPath, route: 'editor', error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
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
