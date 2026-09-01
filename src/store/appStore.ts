import { create } from 'zustand'
import { DEFAULT_COPY_SETTINGS, DEFAULT_GIT_CONFIG, type CopySettingKey, type CopySettings, type FsAdapter, type GitConfig, type LayoutKind, type MapInfo, type ThemePref } from '../types/files'
import { loadConfig, saveConfig } from '../services/config'
import { createMap, listMaps } from '../services/workspace'
import { sweepTmpOrphans } from '../services/tmpSweep'
import { applyDocumentTheme, resolveTheme, type ResolvedTheme } from '../services/theme'
import { checkAndBackup, gitHistory, gitStatusInfo, restoreToVersion, type GitStatusInfo, type HistoryEntry } from '../services/gitBackup'
import type { GitRun } from '../types/ports'

interface AppState {
  route: 'library' | 'editor'
  /** 启动完成标志（v2.4）：init（含磁盘 IO）完成前 App 显示 boot loading，不闪开屏/案头 */
  booted: boolean
  /** 最近打开清单（v2.4 案头欢迎页）：mdPath 新→旧，上限 10 */
  recentOpened: string[]
  /** 会话内打开 MRU（v2.5 编辑器快速切换）：内存态不落盘，Ctrl+Tab ping-pong 的数据源
   *  （「上一张」= 首个 ≠ 当前图的项；区别于跨会话的 recentOpened） */
  sessionRecent: string[]
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
  /** 顶部条（自定义标题栏）取色令牌：案头 '--sidebar'（视口顶是 sidebar 色场）、编辑器/
   *  开屏 '--background'；视图挂载时声明，TitleBar 据此换底色与视口顶部无缝 */
  titlebarBg: '--sidebar' | '--background'
  /** 复制行为设置（M5b Task 4：init 自配置，切换时持久化；EditorView 复制时按此后处理） */
  settings: CopySettings
  /** 版本管理配置（M20 想法8）：init 自配置，setGitConfig 持久化 */
  gitConfig: GitConfig
  /** git 命令端口（M20）：App 装配注入（生产 Tauri git_exec / E2E harness 桩）；null 时备份为 no-op */
  gitRun: GitRun | null
  /** 最近备份结果摘要（状态显示）；null = 从未执行 */
  lastBackup: string | null
  /** 仓库状态（设置页显示） */
  gitStatus: GitStatusInfo
  /** 版本历史（M22 回滚 UI）：最近提交列表；空 = 无仓库/未加载 */
  gitHistoryList: HistoryEntry[]
  setAdapter: (fs: FsAdapter) => void
  init: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
  /** 退出工作区（v0.7.0 验收：设置页「退出工作区（回到开屏）」）：清内存态并持久化 workspaceDir:null */
  exitWorkspace: () => Promise<void>
  refreshMaps: () => Promise<void>
  setSelectedDir: (rel: string) => void
  /** 模板 md 可选参（M16）：传入即以模板实例化（根名替换为 name） */
  createAndOpen: (name: string, templateContent?: string) => Promise<void>
  openMap: (mdPath: string) => Promise<void>
  setPreferredLayout: (kind: LayoutKind) => Promise<void>
  setThemePref: (p: ThemePref) => Promise<void>
  setSetting: (key: CopySettingKey, value: boolean) => Promise<void>
  /** 版本管理配置变更（M20）：即时生效 + load-merge-save 持久化 */
  setGitConfig: (patch: Partial<GitConfig>) => Promise<void>
  /** 立即备份（M20 幂等）：App 定时器与设置页手动钮共用；端口未注入/未启用/无工作区 no-op */
  backupNow: () => Promise<void>
  /** 刷新仓库状态（设置页打开时） */
  refreshGitStatus: () => Promise<void>
  /** 拉取版本历史（M22 历史对话框打开时） */
  fetchGitHistory: () => Promise<void>
  /** 恢复到指定版本（M22）：工作区文件回到该提交（新提交落盘），刷新案头清单与状态。
   *  返回 null=成功，否则中文错误（对话框显示） */
  restoreVersion: (hash: string) => Promise<string | null>
  markDirty: () => void
  clearDirty: () => void
  backToLibrary: () => Promise<void>
  setError: (e: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  route: 'library',
  booted: false,
  recentOpened: [],
  sessionRecent: [],
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
  titlebarBg: '--background',
  settings: DEFAULT_COPY_SETTINGS,
  gitConfig: DEFAULT_GIT_CONFIG,
  gitRun: null,
  lastBackup: null,
  gitStatus: { lastCommit: null, aheadCount: null },
  gitHistoryList: [],

  setAdapter: (fs) => set({ adapter: fs }),

  init: async () => {
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    // 主题先于工作区分支应用（未选工作区也生效）：auto 按系统解析，显式值直出
    const themePref = cfg.theme ?? 'auto'
    const resolved = resolveTheme(themePref)
    set({ preferredLayout: cfg.preferredLayout ?? 'mindmap', themePref, resolvedTheme: resolved, settings: cfg.settings, gitConfig: cfg.git })
    applyDocumentTheme(resolved)
    if (cfg.workspaceDir) {
      set({ workspaceDir: cfg.workspaceDir, recentOpened: cfg.recentOpened })
      await get().refreshMaps()
    }
    // v2.4：不再自动回到上次打开的导图——启动恒定落案头（上次内容在「最近打开」一键可达）
    set({ route: 'library', booted: true })
  },

  setWorkspace: async (dir) => {
    const { adapter, configPath } = get()
    // 切换工作区时目录视图回「全部」：新工作区不含旧选中目录
    set({ workspaceDir: dir, selectedDir: '' })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, workspaceDir: dir, lastOpened: get().currentMdPath })
    await get().refreshMaps()
  },

  /** 退出工作区（v0.7.0 验收：回到开屏）：内存清工作区态（列表/选中目录/打开指针），
   *  配置 load-merge-save 持久化 workspaceDir:null——重启停在开屏；lastOpened 一并清空
   *  （无工作区不得残留打开指针，否则换工作区重进会被旧指针劫持） */
  exitWorkspace: async () => {
    const { adapter, configPath } = get()
    set({ workspaceDir: null, maps: [], selectedDir: '', currentMdPath: null, sessionRecent: [] })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, workspaceDir: null, lastOpened: null })
  },

  refreshMaps: async () => {
    const { adapter, workspaceDir } = get()
    if (!workspaceDir) return
    // 案头刷新即清扫原子写孤儿 tmp（编辑器内不触发此路径，无在途写冲突）
    await sweepTmpOrphans(adapter, workspaceDir).catch(() => {})
    set({ maps: await listMaps(adapter, workspaceDir) })
  },

  setSelectedDir: (rel) => set({ selectedDir: rel }),

  /** 抛错语义（M16 验收）：输入类错误（空名/非法字符/重名）抛给调用方，由
   *  新建对话框就地显示、不关框——不再吞进全局 error-banner */
  createAndOpen: async (name, templateContent) => {
    const { adapter, configPath, workspaceDir, preferredLayout } = get()
    if (!workspaceDir) return
    const info = await createMap(adapter, workspaceDir, name, preferredLayout, templateContent)
    set({ currentMdPath: info.mdPath, route: 'editor', error: null, sessionRecent: [info.mdPath, ...get().sessionRecent.filter((p) => p !== info.mdPath)] })
    // 新建即最近（v2.5）：与 openMap 同款 MRU 维护——新图立即可达快速切换浮层与案头欢迎页
    const recentOpened = [info.mdPath, ...get().recentOpened.filter((p) => p !== info.mdPath)].slice(0, 10)
    set({ recentOpened })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, recentOpened })
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

  /** 版本管理（M20）：配置 load-merge-save 持久化 */
  setGitConfig: async (patch) => {
    const { adapter, configPath } = get()
    const gitConfig = { ...get().gitConfig, ...patch }
    set({ gitConfig })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, git: gitConfig })
  },

  backupNow: async () => {
    const { gitRun, gitConfig, workspaceDir } = get()
    if (gitRun === null || !gitConfig.enabled || workspaceDir === null) return
    const r = await checkAndBackup(workspaceDir, gitConfig, gitRun)
    // 状态摘要：提交消息 / 跳过原因 / 致命错误（中文）
    let summary: string
    if (r.fatal !== null) summary = `备份失败：${r.fatal}`
    else if (!r.committed) summary = `无变更`
    else {
      // 已提交：推送结果三分支（成功并推送 / 失败附原因 / 未配置推送）
      let push: string
      if (r.push.kind === 'ok') push = '并推送'
      else if (r.push.kind === 'error') push = `（推送失败：${r.push.message}）`
      else push = ''
      summary = `已提交${push}`
    }
    set({ lastBackup: summary })
    await get().refreshGitStatus()
  },

  refreshGitStatus: async () => {
    const { gitRun, workspaceDir } = get()
    if (gitRun === null || workspaceDir === null) return
    set({ gitStatus: await gitStatusInfo(workspaceDir, gitRun) })
  },

  fetchGitHistory: async () => {
    const { gitRun, workspaceDir } = get()
    if (gitRun === null || workspaceDir === null) return
    set({ gitHistoryList: await gitHistory(workspaceDir, gitRun) })
  },

  restoreVersion: async (hash) => {
    const { gitRun, workspaceDir } = get()
    if (gitRun === null || workspaceDir === null) return '未启用版本管理'
    const err = await restoreToVersion(workspaceDir, hash, gitRun)
    if (err !== null) return err
    await get().refreshMaps()
    await get().refreshGitStatus()
    await get().fetchGitHistory()
    return null
  },

  openMap: async (mdPath) => {
    // 会话内 MRU 置顶（v2.5 快速切换）：与持久化的 recentOpened 分开维护（各取各的语义）
    set({ currentMdPath: mdPath, route: 'editor', error: null, sessionRecent: [mdPath, ...get().sessionRecent.filter((p) => p !== mdPath)] })
    const { adapter, configPath } = get()
    // 最近打开清单：置顶去重截断（v2.4 案头欢迎页），随 lastOpened 一并持久化
    const recentOpened = [mdPath, ...get().recentOpened.filter((p) => p !== mdPath)].slice(0, 10)
    set({ recentOpened })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, lastOpened: mdPath, recentOpened })
  },

  markDirty: () => set({ dirty: true }),
  clearDirty: () => set({ dirty: false }),

  backToLibrary: async () => {
    set({ currentMdPath: null, dirty: false, route: 'library' })
    await get().refreshMaps()
  },

  setError: (e) => set({ error: e }),
}))
