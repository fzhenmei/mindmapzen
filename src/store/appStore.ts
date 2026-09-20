import { create } from 'zustand'
import { DEFAULT_AI_CONFIG, DEFAULT_COPY_SETTINGS, DEFAULT_GIT_CONFIG, type AiAdvice, type AiConfig, type CopySettingKey, type CopySettings, type FsAdapter, type GitConfig, type LanguagePref, type LayoutKind, type LibrarySort, type MapInfo, type PreviewOutlinePref, type ThemePref } from '../types/files'
import { loadConfig, saveConfig } from '../services/config'
import { createMap, listMaps } from '../services/workspace'
import { sweepTmpOrphans } from '../services/tmpSweep'
import { basketAbsPath, defaultBasketName, ensureBasket, insertIdeaIntoTree, readMapTree, resolveBasketRelPath, type BasketIdea } from '../services/basket'
import { serialize } from '../services/mdTree'
import { showToast } from '../services/toast'
import { applyDocumentTheme, resolveTheme, type ResolvedTheme } from '../services/theme'
import { changeUiLanguage, i18n } from '../i18n'
import { resolveUiLang, systemUiLanguage, type UiLocale } from '../i18n/resolve'
import { checkAndBackup, gitDiffStat, gitHistory, gitStatusInfo, restoreToVersion, type BackupOutcome, type DiffFile, type GitStatusInfo, type HistoryEntry } from '../services/gitBackup'
import type { PendingLocate } from '../services/statusOps'
import type { GitClone, GitRun } from '../types/ports'
import type { ZenNode } from '../types/tree'

/** 视图模式（2026-09 画布三态）：导图 / Markdown / 看板 */
export type ViewMode = 'mindmap' | 'markdown' | 'kanban'

/** 篮子引擎端口：EditorView 在当前图 = 篮子图时注册（捕获/删除走引擎，撤销栈可用） */
export interface BasketEnginePort {
  /** true = 已插入（引擎可用）；false = 让位文件层（引擎尚未就绪等） */
  insertIdea(idea: BasketIdea): boolean
  /** true = 已按文本删除根下首个命中 */
  removeIdeaByText(text: string): boolean
}

export type CaptureResult = { ok: true } | { ok: false; error: string }

interface AppState {
  route: 'library' | 'editor' // 两空间（2026-09 画布三态 M3：工作台并入案头，spec §3.3）
  /** App 级对话框(2026-09 导航系统 spec §6):设置及其二级历史框——三空间可达,
   *  区别于案头 LibraryDialogs 的文件操作框群;至多一个(Radix modal 语义) */
  appDialog: 'settings' | 'history' | null
  openAppDialog: (kind: 'settings' | 'history') => void
  closeAppDialog: () => void
  /** 目录选择端口(2026-09 导航系统 spec §6):设置「更换工作区」用——App 装配注入
   *  (生产 Tauri 对话框 / E2E __zenE2e 桩),同 adapter 注入模式;null 时 no-op */
  pickDirPort: (() => Promise<string | null>) | null
  setPickDirPort: (p: (() => Promise<string | null>) | null) => void
  /** 待执行的工作区动作(2026-09 导航系统 spec §6 安全规则):编辑器脏态下从设置发起
   *  更换/退出时先记此字段,EditorView 安全链保存成功后消费执行——消费即清 */
  pendingWorkspaceAction: 'change' | 'exit' | null
  setPendingWorkspaceAction: (v: 'change' | 'exit' | null) => void
  /** 工作区动作请求:编辑器脏态 → 记 pending(由 EditorView 保存后执行);其余直接执行 */
  requestWorkspaceAction: (kind: 'change' | 'exit') => void
  /** 工作区动作执行(AppDialogs 与 EditorView 安全网共用终点) */
  executeWorkspaceAction: (kind: 'change' | 'exit') => Promise<void>
  /** 启动完成标志（v2.4）：init（含磁盘 IO）完成前 App 显示 boot loading，不闪开屏/案头 */
  booted: boolean
  /** 最近打开清单（v2.4 案头欢迎页）：mdPath 新→旧，上限 10 */
  recentOpened: string[]
  /** 会话内打开 MRU（v2.5 编辑器快速切换）：内存态不落盘，Ctrl+Tab ping-pong 的数据源
   *  （「上一张」= 首个 ≠ 当前图的项；区别于跨会话的 recentOpened） */
  sessionRecent: string[]
  /** 会话内 tab 稳定序（2026-09 顶部导图胶囊条）：内存态不落盘。区别于 recentOpened/
   *  sessionRecent 的 MRU 置顶（切换即跳动，连点翻图时鼠标记忆失效）——已在列不重排、
   *  新开尾部追加，胶囊位置恒定防误触；init 自 recentOpened 前 5 初始化（重启后胶囊仍在）。
   *  上限 5（2026-09 用户裁定：10 个太多），短于 recentOpened 的 10——胶囊条只翻活跃图，
   *  更多走 Ctrl+P 搜索 */
  mapTabs: string[]
  workspaceDir: string | null
  maps: MapInfo[]
  /** 案头左树当前选中目录（''=全部；相对工作区路径，'/' 分隔）。maps 在 store 中不过滤，由 LibraryView 渲染时派生 */
  selectedDir: string
  currentMdPath: string | null
  /** 编辑器重挂载序号（外部变更冲突 reload 用）：App 层 EditorView key 拼接此值，
   *  递增即强制重挂载当前图（丢弃内存编辑、从磁盘重载）——同路径 openMap 不变 key 无法重开 */
  editorSeq: number
  /** 视图模式（2026-09 画布三态）：导图 / Markdown / 看板浮层。内存态不落盘——重启恒回导图（导图是默认形态，Markdown/看板是会话内视角）；切换是视图导航非内容编辑，不置脏不触发保存链 */
  viewMode: ViewMode
  /** 视图模式切换（EditorView 砚栏视图组 / 快捷键 / 看板关闭钮共用） */
  setViewMode: (v: ViewMode) => void
  /** 工作台待定位节点（2026-09 工作台 spec §5）：跨图跳转携带的文本寻址器——
   * md 不序列化 uid，扫描期 uid 在引擎侧必然失配（spec §11 Ruling）；
   * mapPath 绑定目标图（终审 Important-1）：openMap 失败（文件被删/坏档）时寻址器残留，
   * 用户切到别图后 EditorView 消费前须校验目标——mapPath 与当前图不符即弃置（console.warn
   * 线索），杜绝「错图消费」误定位；EditorView 引擎 onReady 后消费（locateNode 定位）
   * 并即刻清空——消费即清，避免切图残留误定位。view:'kanban'（2026-09 案头跳看板）：
   * 消费分派看板态挂载 + KanbanView 卡片高亮（类型与语义见 statusOps.PendingLocate） */
  pendingLocate: PendingLocate | null
  setPendingLocate: (v: PendingLocate | null) => void
  /** 返回案头(2026-09 画布三态 M3,两空间收敛:来路恒案头):清编辑态 + refreshMaps。
   *  入口须经 leaveTo 安全链 */
  exitEditor(): Promise<void>
  dirty: boolean
  error: string | null
  configPath: string
  adapter: FsAdapter
  /** 用户偏好的默认布局（init 自配置；切换布局时更新并持久化） */
  preferredLayout: LayoutKind
  /** 新建导图上次选择的目录（2026-09 目录选择；init 自配置，createAndOpen 更新并
   *  持久化）：新建对话框默认选中（树右键入口的 initialDir 优先） */
  lastNewMapDir: string
  /** 主题三态偏好（auto/亮/暗；init 自配置，切换时持久化） */
  themePref: ThemePref
  /** 预览大纲三态偏好（2026-09 大纲面板；auto = 跟随预览主区宽，显式 on/off 记住手动开关） */
  previewOutline: PreviewOutlinePref
  /** 收藏清单（2026-09 收藏置顶）：mdPath 寻址，不设上限；渲染时失联项由视图层宽容
   *  剔除（文件被删/换工作区自动隐藏，切回恢复）；重命名/移动经 relocate 系跟随换址 */
  favorites: string[]
  /** 文件列表排序偏好（2026-09 收藏与排序）：modified=修改时间新→旧（默认）；name=A→Z */
  librarySort: LibrarySort
  /** 案头左树侧栏像素宽（2026-09 分区拖拽）：null = 默认 16rem；拖拽松手/双击恢复时提交 */
  sidebarWidth: number | null
  /** 预览大纲面板像素宽（2026-09 分区拖拽）：null = 默认 14rem；提交语义同 sidebarWidth */
  outlineWidth: number | null
  /** AI 对话配置（2026-09 AI Agent v1）：init 自配置，setAiConfig 合并持久化；
   *  三项全非空 = 已配置（AI 入口显隐依据，Task 11 消费） */
  aiConfig: AiConfig
  /** AI 面板像素宽（2026-09 AI Agent v1）：null = 默认 320；提交语义同 sidebarWidth */
  aiChatWidth: number | null
  /** 工作台 AI 建议缓存（2026-09-14）：双条件复用（24h 内且任务指纹一致），
   *  init 自配置，setAiAdvice load-merge-save 持久化 */
  aiAdvice: AiAdvice | null
  setAiAdvice: (advice: AiAdvice | null) => Promise<void>
  /** 解析后的实际主题（auto 按系统偏好解析；驱动 document data-theme） */
  resolvedTheme: ResolvedTheme
  /** 界面语言三态偏好(auto = 跟随系统) */
  languagePref: LanguagePref
  /** 解析后的实际界面语言(驱动 i18n 实例与 html lang) */
  resolvedLanguage: UiLocale
  /** 顶部条（自定义标题栏）取色令牌：案头 '--sidebar'（视口顶是 sidebar 色场）、编辑器/
   *  开屏 '--background'；视图挂载时声明，TitleBar 据此换底色与视口顶部无缝 */
  titlebarBg: '--sidebar' | '--background'
  /** 复制行为设置（M5b Task 4：init 自配置，切换时持久化；EditorView 复制时按此后处理） */
  settings: CopySettings
  /** 版本管理配置（M20 想法8）：init 自配置，setGitConfig 持久化 */
  gitConfig: GitConfig
  /** AI 安全网告知已示（v1.1 ②）：git 备份未启用时首轮 AI 发送前插信息卡——会话级一次，
   *  不持久化；App 级而非 chatStore——切图 reset 不重弹 */
  aiBackupNoticeShown: boolean
  markAiBackupNoticeShown: () => void
  /** git 命令端口（M20）：App 装配注入（生产 Tauri git_exec / E2E harness 桩）；null 时备份为 no-op */
  gitRun: GitRun | null
  /** git 克隆端口（「从 Git 库打开」）：App 装配注入（生产 Tauri git_clone / E2E harness 桩）；
   *  null 时克隆入口报「未启用版本管理」（与 gitRun 同门） */
  gitClone: GitClone | null
  /** 最近备份结果原始数据（2026-09 i18n：只存 BackupOutcome 枚举与原始串，人话摘要由
   *  渲染层 SettingsDialog 拼——语言切换即时反映，store 不落拼好文案）；null = 从未执行 */
  lastBackup: BackupOutcome | null
  /** 仓库状态（设置页显示） */
  gitStatus: GitStatusInfo
  /** 版本历史（M22 回滚 UI）：最近提交列表；空 = 无仓库/未加载 */
  gitHistoryList: HistoryEntry[]
  /** 漫游引导（2026-09 onboarding tour）：激活态与当前步仅内存；tourDone 为 config 镜像
   *  （init 载入，finishTour 置 true 落盘）。步进编排（before 钩子/越末步）在 TourOverlay，
   *  store 只持状态——避免 store→tourSteps→store 模块循环 */
  tourActive: boolean
  tourStep: number
  tourDone: boolean
  startTour: () => void
  setTourStep: (n: number) => void
  /** 完成或跳过同路径（spec §3.3：跳过即完成，不再骚扰）；幂等——重看后再 finish 仍落 true */
  finishTour: () => Promise<void>
  /** 点子篮子相对路径（2026-09 点子篮子）：init/换工作区时按 cfg.basketPath 或语言默认名同步 */
  basketRelPath: string | null
  /** 篮子引擎端口（EditorView 在「当前图 = 篮子图」时注册；就近引擎写入用）：不持久化 */
  basketEngine: BasketEnginePort | null
  setBasketEngine: (p: BasketEnginePort | null) => void
  /** 捕获点子（spec §4.2 就近引擎）：端口在位走引擎（内存态同步、撤销栈可用），否则文件层 */
  captureIdea: (idea: BasketIdea) => Promise<CaptureResult>
  /** 挂载成功后从篮子删除条目（文本匹配根下首个）：引擎端口优先，否则文件层 */
  removeBasketIdeaByText: (text: string) => Promise<CaptureResult>
  setAdapter: (fs: FsAdapter) => void
  init: () => Promise<void>
  setWorkspace: (dir: string) => Promise<void>
  /** 退出工作区（v0.7.0 验收：设置页「退出工作区（回到开屏）」）：清内存态并持久化 workspaceDir:null */
  exitWorkspace: () => Promise<void>
  refreshMaps: () => Promise<void>
  setSelectedDir: (rel: string) => void
  /** 模板 md 可选参（M16）：传入即以模板实例化（根名替换为 name）；
   *  relDir（2026-09 树右键「在此新建导图」）：目标子目录，缺省 ''=工作区根 */
  createAndOpen: (name: string, templateContent?: string, relDir?: string) => Promise<void>
  openMap: (mdPath: string) => Promise<void>
  /** 打开失败清理（2026-09 优雅恢复）：文件读不到（被删/移动/权限）时移出最近清单——
   *  recentOpened 持久化 + sessionRecent 内存（Ctrl+Tab 数据源）；解析失败不调用（文件仍在，修复后可达） */
  dropRecent: (mdPath: string) => Promise<void>
  setPreferredLayout: (kind: LayoutKind) => Promise<void>
  setThemePref: (p: ThemePref) => Promise<void>
  setLanguagePref: (pref: LanguagePref) => Promise<void>
  setPreviewOutline: (pref: PreviewOutlinePref) => Promise<void>
  /** 收藏切换（2026-09 收藏置顶）：已在清单=移除，不在=追加；load-merge-save 持久化 */
  toggleFavorite: (mdPath: string) => Promise<void>
  /** 收藏换址跟随（重命名/移动导图后由视图层调用）：未收藏 no-op 不写盘 */
  relocateFavorite: (from: string, to: string) => Promise<void>
  /** 目录整子树移动的前缀重写：fromDir/toDir = 目录绝对路径，子内收藏随迁 */
  relocateFavoritesUnder: (fromDir: string, toDir: string) => Promise<void>
  /** 列表排序偏好（2026-09）：即时生效 + load-merge-save 持久化 */
  setLibrarySort: (s: LibrarySort) => Promise<void>
  /** 分区宽度提交（2026-09 拖拽）：null = 恢复默认宽（双击手柄路径） */
  setSidebarWidth: (w: number | null) => Promise<void>
  setOutlineWidth: (w: number | null) => Promise<void>
  /** AI 配置变更（2026-09 AI Agent v1）：部分字段合并，load-merge-save 持久化 */
  setAiConfig: (patch: Partial<AiConfig>) => Promise<void>
  /** AI 面板宽度提交（2026-09 拖拽）：null = 恢复默认宽 */
  setAiChatWidth: (w: number | null) => Promise<void>
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
   *  返回 null=成功，否则错误文案（未启用守卫经 errors 域本地化；服务层错误原样透传，
   *  Task 10 迁移） */
  restoreVersion: (hash: string) => Promise<string | null>
  /** 恢复预览（M23 盲盒问题）：该版本相对当前的文件级差异（现取现返不进全局态）；
   *  null = 差异不可得（未启用/命令失败），files 空 = 无差异 */
  diffPreview: (hash: string) => Promise<{ files: DiffFile[]; ins: number; del: number } | null>
  markDirty: () => void
  clearDirty: () => void
  /** 冲突裁决「以磁盘版为准」：递增重挂序号（App 层 key 变化），当前图从磁盘重载 */
  reopenEditor: () => void
  backToLibrary: () => Promise<void>
  setError: (e: string | null) => void
}

/** tab 稳定序维护（2026-09 顶部胶囊条）：已在列不动、新开尾部追加，超 5 淘汰最早（上限 5，2026-09 用户裁定） */
const appendTab = (tabs: string[], mdPath: string): string[] =>
  tabs.includes(mdPath) ? tabs : [...tabs, mdPath].slice(-5)

/** 篮子文件层读改写（捕获/删除共用，spec §4.2 非引擎路径）：ensure → read → mutate → 原子写。
 *  篮子丢失即按默认名重建（§3.3：console 线索 + toast 双出口，不静默）；失败一律显式出口 */
async function writeBasketFile(
  mutate: (tree: ZenNode) => ZenNode,
  ctx: { fs: FsAdapter; wsDir: string; rel: string; rootText: string },
): Promise<CaptureResult> {
  const abs = basketAbsPath(ctx.wsDir, ctx.rel)
  try {
    const existed = await ctx.fs.exists(abs)
    await ensureBasket(ctx.fs, ctx.wsDir, ctx.rel, ctx.rootText)
    if (!existed) {
      console.warn('篮子文件不存在，已按默认名重建', abs) // console 线索 + toast 双出口（spec §3.3）
      showToast(i18n.t('basket.basketRecreated'))
    }
    const tree = await readMapTree(ctx.fs, abs)
    if (tree === null) return { ok: false, error: i18n.t('basket.errors.readFailed') }
    await ctx.fs.writeTextFileAtomic(abs, serialize(mutate(tree)))
    return { ok: true }
  } catch (e) {
    console.error('篮子写入失败', abs, e)
    return { ok: false, error: i18n.t('basket.errors.writeFailed') }
  }
}

/** 根下首个文本命中即删（不可变）；未命中原样返回——md 不序列化 uid，删除只能文本寻址 */
function removeIdeaFromTree(tree: ZenNode, text: string): ZenNode {
  const idx = tree.children.findIndex((c) => c.text === text)
  if (idx === -1) return tree
  return { ...tree, children: [...tree.children.slice(0, idx), ...tree.children.slice(idx + 1)] }
}

export const useAppStore = create<AppState>((set, get) => ({
  route: 'library',
  appDialog: null,
  openAppDialog: (kind) => set({ appDialog: kind }),
  closeAppDialog: () => set({ appDialog: null }),
  pickDirPort: null,
  setPickDirPort: (p) => set({ pickDirPort: p }),
  pendingWorkspaceAction: null,
  setPendingWorkspaceAction: (v) => set({ pendingWorkspaceAction: v }),
  booted: false,
  recentOpened: [],
  sessionRecent: [],
  mapTabs: [],
  workspaceDir: null,
  maps: [],
  selectedDir: '',
  currentMdPath: null,
  editorSeq: 0,
  viewMode: 'mindmap',
  pendingLocate: null,
  setPendingLocate: (v) => set({ pendingLocate: v }),
  dirty: false,
  error: null,
  configPath: '/cfg.json',
  adapter: null as unknown as FsAdapter, // 生产环境在 main.tsx 注入 tauriFsAdapter
  preferredLayout: 'mindmap',
  /** 新建导图上次选择的目录（2026-09 目录选择）：新建对话框默认选中（initialDir 优先） */
  lastNewMapDir: '',
  themePref: 'auto',
  languagePref: 'auto',
  previewOutline: 'auto',
  favorites: [],
  librarySort: 'modified',
  sidebarWidth: null,
  outlineWidth: null,
  aiConfig: DEFAULT_AI_CONFIG,
  aiChatWidth: null,
  aiAdvice: null,
  resolvedTheme: 'light',
  resolvedLanguage: 'zh-CN',
  titlebarBg: '--background',
  settings: DEFAULT_COPY_SETTINGS,
  gitConfig: DEFAULT_GIT_CONFIG,
  /** AI 安全网告知已示（v1.1 ②）：git 备份未启用时首轮 AI 发送前插信息卡——会话级一次，
   *  不持久化（重开应用再提；开关切换后语义仍成立）；App 级而非 chatStore——切图 reset 不重弹 */
  aiBackupNoticeShown: false,
  markAiBackupNoticeShown: () => set({ aiBackupNoticeShown: true }),
  gitRun: null,
  gitClone: null,
  lastBackup: null,
  gitStatus: { lastCommit: null, aheadCount: null },
  gitHistoryList: [],
  tourActive: false,
  tourStep: 0,
  tourDone: false,
  basketRelPath: null,
  basketEngine: null,

  setAdapter: (fs) => set({ adapter: fs }),

  init: async () => {
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    // 主题先于工作区分支应用（未选工作区也生效）：auto 按系统解析，显式值直出
    const themePref = cfg.theme ?? 'auto'
    const resolved = resolveTheme(themePref)
    // 语言与主题同期应用(未选工作区也生效):显式值直出,auto 按系统解析
    const languagePref = cfg.language ?? 'auto'
    const locale = resolveUiLang(languagePref, systemUiLanguage())
    set({ preferredLayout: cfg.preferredLayout ?? 'mindmap', lastNewMapDir: cfg.lastNewMapDir, themePref, previewOutline: cfg.previewOutline, favorites: cfg.favorites, librarySort: cfg.librarySort, sidebarWidth: cfg.sidebarWidth, outlineWidth: cfg.outlineWidth, aiConfig: cfg.ai, aiChatWidth: cfg.aiChatWidth, aiAdvice: cfg.aiAdvice, resolvedTheme: resolved, languagePref, resolvedLanguage: locale, settings: cfg.settings, gitConfig: cfg.git, tourDone: cfg.tourDone })
    applyDocumentTheme(resolved)
    changeUiLanguage(locale)
    if (cfg.workspaceDir) {
      // mapTabs 初始 = 持久 MRU 序前 5（2026-09 顶部胶囊条）：重启后胶囊仍在，跨会话保留
      set({ workspaceDir: cfg.workspaceDir, recentOpened: cfg.recentOpened, mapTabs: cfg.recentOpened.slice(0, 5) })
      // 篮子相对路径同期同步（spec §3.1/§3.3）：cfg.basketPath 为空时按语言默认名（创建即固定，不随 i18n 漂移）
      set({ basketRelPath: resolveBasketRelPath(cfg.basketPath, locale) })
      await get().refreshMaps()
    }
    // 启动落点（2026-09 画布三态 M3：工作台并入案头）：恒落案头——跨图总览由欢迎页
    // DeskOverview 承接（总览即「先见今天该做什么」），e2e 与产品分支不再分叉。
    // v2.4 口径「不自动回到上次打开的导图」不变——落点不是编辑器，上次内容仍在「最近打开」可达
    set({ route: 'library', booted: true })
  },

  setWorkspace: async (dir) => {
    const { adapter, configPath } = get()
    // 切换工作区时目录视图回「全部」：新工作区不含旧选中目录
    set({ workspaceDir: dir, selectedDir: '' })
    const cfg = await loadConfig(adapter, configPath)
    // 篮子随工作区走（spec §3.3）：relPath 相对新工作区解析（cfg.basketPath 或语言默认名）
    set({ basketRelPath: resolveBasketRelPath(cfg.basketPath, get().resolvedLanguage) })
    await saveConfig(adapter, configPath, { ...cfg, workspaceDir: dir, lastOpened: get().currentMdPath })
    await get().refreshMaps()
  },

  /** 退出工作区（v0.7.0 验收：回到开屏）：内存清工作区态（列表/选中目录/打开指针），
   *  配置 load-merge-save 持久化 workspaceDir:null——重启停在开屏；lastOpened 一并清空
   *  （无工作区不得残留打开指针，否则换工作区重进会被旧指针劫持） */
  exitWorkspace: async () => {
    const { adapter, configPath } = get()
    set({ workspaceDir: null, maps: [], selectedDir: '', currentMdPath: null, sessionRecent: [], mapTabs: [] })
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
  createAndOpen: async (name, templateContent, relDir = '') => {
    const { adapter, configPath, workspaceDir, preferredLayout } = get()
    if (!workspaceDir) return
    const info = await createMap(adapter, workspaceDir, name, preferredLayout, templateContent, relDir)
    set({ currentMdPath: info.mdPath, route: 'editor', error: null, sessionRecent: [info.mdPath, ...get().sessionRecent.filter((p) => p !== info.mdPath)], mapTabs: appendTab(get().mapTabs, info.mdPath) })
    // 新建即最近（v2.5）：与 openMap 同款 MRU 维护——新图立即可达快速切换浮层与案头欢迎页
    const recentOpened = [info.mdPath, ...get().recentOpened.filter((p) => p !== info.mdPath)].slice(0, 10)
    // 记住本次选择的目录（2026-09 目录选择）：下次新建对话框默认选中（含根 ''）
    set({ recentOpened, lastNewMapDir: relDir })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, recentOpened, lastNewMapDir: relDir })
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

  /** 语言三态偏好(spec §一.1)：即时切换 i18n + html lang(react-i18next 订阅自动
   *  重渲染，无需重启)，load-merge-save 持久化到应用配置 */
  setLanguagePref: async (pref) => {
    const { adapter, configPath } = get()
    const locale = resolveUiLang(pref, systemUiLanguage())
    set({ languagePref: pref, resolvedLanguage: locale })
    changeUiLanguage(locale)
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, language: pref })
  },

  /** 预览大纲三态偏好（2026-09 大纲面板）：即时生效 + load-merge-save 持久化
   *  （auto = 跟随预览主区宽；显式 on/off 记住用户手动开关，跨会话生效） */
  setPreviewOutline: async (pref) => {
    const { adapter, configPath } = get()
    set({ previewOutline: pref })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, previewOutline: pref })
  },

  /** 收藏与排序（2026-09）：四动作共用 load-merge-save 模式；relocate 系在路径未命中
   *  收藏清单时 no-op 提前返回——移动/改名是高频操作，不收藏的文件不产生配置写盘 */
  toggleFavorite: async (mdPath) => {
    const cur = get().favorites
    const favorites = cur.includes(mdPath) ? cur.filter((p) => p !== mdPath) : [...cur, mdPath]
    set({ favorites })
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, favorites })
  },

  relocateFavorite: async (from, to) => {
    const cur = get().favorites
    if (!cur.includes(from)) return
    const favorites = cur.map((p) => (p === from ? to : p))
    set({ favorites })
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, favorites })
  },

  relocateFavoritesUnder: async (fromDir, toDir) => {
    // 前缀归一（去尾斜杠）后以 from + '/' 锚定子树；to 同步归一防双斜杠
    let from = fromDir
    while (from.endsWith('/')) from = from.slice(0, -1)
    let to = toDir
    while (to.endsWith('/')) to = to.slice(0, -1)
    const prefix = from + '/'
    const cur = get().favorites
    if (!cur.some((p) => p.startsWith(prefix))) return
    const favorites = cur.map((p) => (p.startsWith(prefix) ? to + p.slice(from.length) : p))
    set({ favorites })
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, favorites })
  },

  setLibrarySort: async (s) => {
    set({ librarySort: s })
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, librarySort: s })
  },

  /** 分区宽度提交（2026-09 左栏/大纲拖拽）：即时生效 + load-merge-save 持久化；
   *  null = 恢复默认（双击手柄）。拖拽过程只走组件内存态，不触本 setter（免逐帧写盘） */
  setSidebarWidth: async (w) => {
    const { adapter, configPath } = get()
    set({ sidebarWidth: w })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, sidebarWidth: w })
  },

  setOutlineWidth: async (w) => {
    const { adapter, configPath } = get()
    set({ outlineWidth: w })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, outlineWidth: w })
  },

  /** AI 配置变更（2026-09 AI Agent v1）：patch 部分合并（设置页逐字段保存，不覆盖未提字段），
   *  load-merge-save 持久化 */
  setAiConfig: async (patch) => {
    const { adapter, configPath, aiConfig } = get()
    const cfg = await loadConfig(adapter, configPath)
    const ai = { ...aiConfig, ...patch }
    await saveConfig(adapter, configPath, { ...cfg, ai })
    set({ aiConfig: ai })
  },
  /** AI 面板宽度提交：即时生效 + load-merge-save 持久化；null = 恢复默认宽 */
  setAiChatWidth: async (w) => {
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, aiChatWidth: w })
    set({ aiChatWidth: w })
  },

  /** 工作台 AI 建议缓存提交（2026-09-14）：即时生效 + load-merge-save 持久化；
   *  null = 清除（换建议覆盖/弃用）。存档只在流正常结束处调用（useAskAi） */
  setAiAdvice: async (advice) => {
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, aiAdvice: advice })
    set({ aiAdvice: advice })
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
    // 只落 BackupOutcome 原始数据（摘要拼装移渲染层 SettingsDialog，见 lastBackup 注）
    set({ lastBackup: await checkAndBackup(workspaceDir, gitConfig, gitRun) })
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
    // 守卫文案经 errors 域（事件时求值语言恒新；服务层错误 Task 10 迁移）
    if (gitRun === null || workspaceDir === null) return i18n.t('errors.gitNotEnabled')
    const err = await restoreToVersion(workspaceDir, hash, gitRun)
    if (err !== null) return err
    await get().refreshMaps()
    await get().refreshGitStatus()
    await get().fetchGitHistory()
    return null
  },

  diffPreview: async (hash) => {
    const { gitRun, workspaceDir } = get()
    if (gitRun === null || workspaceDir === null) return null
    return gitDiffStat(workspaceDir, hash, gitRun)
  },

  openMap: async (mdPath) => {
    // 会话内 MRU 置顶（v2.5 快速切换）：与持久化的 recentOpened 分开维护（各取各的语义）
    set({ currentMdPath: mdPath, route: 'editor', error: null, sessionRecent: [mdPath, ...get().sessionRecent.filter((p) => p !== mdPath)], mapTabs: appendTab(get().mapTabs, mdPath) })
    const { adapter, configPath } = get()
    // 最近打开清单：置顶去重截断（v2.4 案头欢迎页），随 lastOpened 一并持久化
    const recentOpened = [mdPath, ...get().recentOpened.filter((p) => p !== mdPath)].slice(0, 10)
    set({ recentOpened })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, lastOpened: mdPath, recentOpened })
  },

  dropRecent: async (mdPath) => {
    const recentOpened = get().recentOpened.filter((p) => p !== mdPath)
    set({ recentOpened, sessionRecent: get().sessionRecent.filter((p) => p !== mdPath), mapTabs: get().mapTabs.filter((p) => p !== mdPath) })
    const { adapter, configPath } = get()
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, recentOpened })
  },

  markDirty: () => set({ dirty: true }),
  clearDirty: () => set({ dirty: false }),

  reopenEditor: () => set((s) => ({ editorSeq: s.editorSeq + 1 })),

  // 看板视图切换（2026-09）：纯内存态（见字段注释——不落盘，重启恒回导图）
  setViewMode: (v) => set({ viewMode: v }),

  // 两空间收敛（2026-09 画布三态 M3）：来路恒案头——refreshMaps + 清编辑态（backToLibrary）
  exitEditor: async () => {
    await get().backToLibrary()
  },

  requestWorkspaceAction: (kind) => {
    const { route } = get()
    // 编辑器路由统一记 pending 交 EditorView 安全网(spec §6「所有新出口 guardAiTurn 拦截」;
    // 终审修复,原仅脏态走此路):AI 回合流式窗口内首编辑未落 dirty 仍 false,干净图直通会
    // 卸载 EditorView → chatStore.reset 只清 stopRequest 不 abort 在途流,泄漏后台请求。
    // 挂载侧消费链 guardAiTurn+leaveTo(干净图 explicitSave 空成功零额外成本);非编辑器
    // 路由无该安全网,保持直接执行
    if (route === 'editor') {
      set({ appDialog: null, pendingWorkspaceAction: kind })
      return
    }
    set({ appDialog: null })
    void get().executeWorkspaceAction(kind)
  },
  executeWorkspaceAction: async (kind) => {
    if (kind === 'exit') {
      try {
        await get().exitWorkspace()
      } catch (e) {
        console.error('退出工作区失败', e)
        get().setError(i18n.t('errors.exitWorkspaceFailed', { reason: String(e) }))
      }
      return
    }
    const port = get().pickDirPort
    if (port === null) return
    try {
      const dir = await port()
      // 取消选择:留在原地(不关编辑器、不切工作区)
      if (dir === null || dir === '') return
      // 先清编辑态再切换:currentMdPath 指旧工作区文件,setWorkspace 的 lastOpened
      // 持久化取它(案头发起时恒 null 的隐含假设),残留会写入脏指针;route 落案头
      set({ currentMdPath: null, dirty: false, route: 'library' })
      await get().setWorkspace(dir)
    } catch (e) {
      console.error('更换工作区失败', e)
      get().setError(i18n.t('errors.setWorkspaceFailed', { reason: String(e) }))
    }
  },

  setBasketEngine: (p) => set({ basketEngine: p }),

  captureIdea: async (idea) => {
    const { adapter, workspaceDir, basketRelPath, basketEngine, resolvedLanguage } = get()
    if (workspaceDir === null) return { ok: false, error: i18n.t('basket.errors.noWorkspace') }
    const rel = basketRelPath ?? resolveBasketRelPath(null, resolvedLanguage)
    if (basketEngine !== null && basketEngine.insertIdea(idea)) return { ok: true }
    return writeBasketFile((tree) => insertIdeaIntoTree(tree, idea), { fs: adapter, wsDir: workspaceDir, rel, rootText: defaultBasketName(resolvedLanguage) })
  },

  removeBasketIdeaByText: async (text) => {
    const { adapter, workspaceDir, basketRelPath, basketEngine, resolvedLanguage } = get()
    if (workspaceDir === null) return { ok: false, error: i18n.t('basket.errors.noWorkspace') }
    const rel = basketRelPath ?? resolveBasketRelPath(null, resolvedLanguage)
    if (basketEngine !== null && basketEngine.removeIdeaByText(text)) return { ok: true }
    return writeBasketFile((tree) => removeIdeaFromTree(tree, text), { fs: adapter, wsDir: workspaceDir, rel, rootText: defaultBasketName(resolvedLanguage) })
  },

  backToLibrary: async () => {
    set({ currentMdPath: null, dirty: false, route: 'library' })
    await get().refreshMaps()
  },

  startTour: () => set({ tourActive: true, tourStep: 0 }),
  setTourStep: (n) => set({ tourStep: n }),

  finishTour: async () => {
    const { adapter, configPath } = get()
    set({ tourActive: false, tourStep: 0, tourDone: true })
    const cfg = await loadConfig(adapter, configPath)
    await saveConfig(adapter, configPath, { ...cfg, tourDone: true })
  },

  setError: (e) => set({ error: e }),
}))
