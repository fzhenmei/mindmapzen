// src/types/files.ts —— 文件系统抽象与工作区文件公共类型
/** 导图条目：relDir = 相对工作区的目录段（'' = 根；不含首尾斜杠，'/' 分隔）；
 *  createdAt/size（M15 资源管理器视图）= 创建时间毫秒与字节大小 */
export interface MapInfo { name: string; mdPath: string; relDir: string; modifiedAt: number; createdAt: number; size: number }

/** 语义布局三态（引擎名映射见 editor/layoutMap.ts；此处定义供 AppConfig/Sidecar 共用） */
export type LayoutKind = 'mindmap' | 'logic' | 'org'

const LAYOUT_KINDS = new Set<LayoutKind>(['mindmap', 'logic', 'org'])

/** 宽容解析配置中的布局偏好：非法/缺失返回 null */
export function parseLayoutKind(v: unknown): LayoutKind | null {
  return LAYOUT_KINDS.has(v as LayoutKind) ? (v as LayoutKind) : null
}

/** 应用主题三态偏好（auto = 跟随系统） */
export type ThemePref = 'auto' | 'light' | 'dark'

const THEME_PREFS = new Set<ThemePref>(['auto', 'light', 'dark'])

/** 宽容解析配置中的主题偏好：非法/缺失回退 auto（旧配置无 theme 字段按 auto 兼容） */
export function parseThemePref(v: unknown): ThemePref {
  return THEME_PREFS.has(v as ThemePref) ? (v as ThemePref) : 'auto'
}

/** 预览大纲三态偏好（2026-09 大纲面板）：auto = 跟随预览主区宽（≥900px 默认显示，实时联动）；
 *  显式 on/off 覆盖响应式默认（用户手动开关后记住） */
export type PreviewOutlinePref = 'auto' | 'on' | 'off'

const PREVIEW_OUTLINE_PREFS = new Set<PreviewOutlinePref>(['auto', 'on', 'off'])

/** 宽容解析配置中的预览大纲偏好：非法/缺失回退 auto（旧配置无字段按 auto 兼容） */
export function parsePreviewOutlinePref(v: unknown): PreviewOutlinePref {
  return PREVIEW_OUTLINE_PREFS.has(v as PreviewOutlinePref) ? (v as PreviewOutlinePref) : 'auto'
}

/** 复制行为设置（M5b Task 4）：copyIncludeNote=复制 md 时包含节点备注引用块；copyIncludeLinks=保留 [[..]] 双链标记 */
export interface CopySettings {
  copyIncludeNote: boolean
  copyIncludeLinks: boolean
}

export type CopySettingKey = keyof CopySettings

export const DEFAULT_COPY_SETTINGS: CopySettings = { copyIncludeNote: false, copyIncludeLinks: true }

/** 宽容解析配置中的复制设置：非对象/字段类型非法逐字段回退默认（旧配置无 settings 字段按默认兼容） */
export function parseSettings(v: unknown): CopySettings {
  if (typeof v !== 'object' || v === null) return DEFAULT_COPY_SETTINGS
  const o = v as Record<string, unknown>
  return {
    copyIncludeNote: typeof o.copyIncludeNote === 'boolean' ? o.copyIncludeNote : DEFAULT_COPY_SETTINGS.copyIncludeNote,
    copyIncludeLinks: typeof o.copyIncludeLinks === 'boolean' ? o.copyIncludeLinks : DEFAULT_COPY_SETTINGS.copyIncludeLinks,
  }
}

export interface AppConfig {
  workspaceDir: string | null
  lastOpened: string | null
  /** 最近打开的导图（mdPath，新→旧，上限 10；v2.4 案头欢迎页右侧列表） */
  recentOpened: string[]
  /** 用户偏好的默认布局（新建导图与无 sidecar 导图的初始布局）；null = 未设置（按 mindmap） */
  preferredLayout: LayoutKind | null
  /** 应用主题三态偏好（auto = 跟随系统；显式 light/dark 覆盖系统） */
  theme: ThemePref
  /** 预览大纲三态偏好（auto = 跟随预览主区宽；显式 on/off 记住用户手动开关） */
  previewOutline: PreviewOutlinePref
  /** 复制行为设置（设置页两开关） */
  settings: CopySettings
  /** 版本管理（M20 想法8）：自动 commit + 远程备份 */
  git: GitConfig
  /** 漫游引导完成标记（2026-09 onboarding tour）：完成或跳过即 true；缺省 false——
   *  老用户升级后首次启动也会看一次（spec §3.1 已确认口径） */
  tourDone: boolean
  /** 案头左树侧栏像素宽（2026-09 分区拖拽）；null = 默认 16rem */
  sidebarWidth: number | null
  /** 预览大纲面板像素宽（2026-09 分区拖拽）；null = 默认 14rem（w-56） */
  outlineWidth: number | null
}
/** 版本管理配置（M20）：宽容解析见 config.ts（parseGitConfig） */
export interface GitConfig {
  enabled: boolean
  /** HTTPS 远程地址；null = 仅本地提交 */
  remoteUrl: string | null
  /** 访问令牌（PAT）；null = 无 */
  token: string | null
}
export const DEFAULT_GIT_CONFIG: GitConfig = { enabled: false, remoteUrl: null, token: null }
/** 宽容解析最近打开清单：仅字符串数组项保留，截断 10（旧配置无字段兼容） */
export function parseRecentOpened(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').slice(0, 10)
}

/** 宽容解析 git 配置：逐字段回退默认（旧配置无 git 字段兼容） */
export function parseGitConfig(v: unknown): GitConfig {
  if (typeof v !== 'object' || v === null) return DEFAULT_GIT_CONFIG
  const o = v as Record<string, unknown>
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_GIT_CONFIG.enabled,
    remoteUrl: typeof o.remoteUrl === 'string' && o.remoteUrl !== '' ? o.remoteUrl : null,
    token: typeof o.token === 'string' && o.token !== '' ? o.token : null,
  }
}

/** 宽容解析引导完成标记：非 boolean 一律 false（旧配置无字段按未完成兼容） */
export function parseTourDone(v: unknown): boolean {
  return typeof v === 'boolean' ? v : false
}

/** 宽容解析分区拖拽宽度（2026-09 案手左栏/大纲面板）：仅正有限数保留，其余回 null（默认宽）；
 *  范围 clamp 不在此做——旧配置存了超范围值由 UI 层挂载时收敛 */
export function parsePanelWidth(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

export const DEFAULT_CONFIG: AppConfig = {
  workspaceDir: null,
  lastOpened: null,
  recentOpened: [],
  preferredLayout: null,
  theme: 'auto',
  previewOutline: 'auto',
  settings: DEFAULT_COPY_SETTINGS,
  git: DEFAULT_GIT_CONFIG,
  tourDone: false,
  sidebarWidth: null,
  outlineWidth: null,
}
/** 连线弯曲记忆条目（M5d Task 5）：键 '/源路径->/目标路径'（路径寻址，节点改名即失联丢弃——sidecar 级语义）。
 *  cx1/cy1、cx2/cy2 = 贝塞尔两控制点相对连线起点/终点的差值（引擎 associativeLineTargetControlOffsets 口径，
 *  结构核验见 docs/notes/engine-api.md「M5d 核验 (d)」）；缺省字段恢复时补 0 */
export interface LinkAdjustEntry {
  cx1?: number
  cy1?: number
  cx2?: number
  cy2?: number
}

export interface Sidecar {
  version: 1
  theme: string
  layout: LayoutKind
  collapsed: string[]
  offsets: Record<string, { dx: number; dy: number }>
  canvas: { x: number; y: number; zoom: number }
  /** 连线弯曲记忆（M5d Task 5）：路径对键 → 控制点差值；容错默认 {} */
  linkAdjust: Record<string, LinkAdjustEntry>
}
export interface FsAdapter {
  readTextFile(p: string): Promise<string>
  writeTextFileAtomic(p: string, contents: string): Promise<void>
  /** 二进制写盘（M5b Task 5 导出 PNG/SVG）：整文件覆盖写，无原子换名（导出非事实源，非原子可接受） */
  writeBytes(p: string, bytes: Uint8Array): Promise<void>
  /** 二进制整读（M19 插图：读图片字节转 dataURL/解析尺寸）；不存在抛错 */
  readBytes(p: string): Promise<Uint8Array>
  readDir(p: string): Promise<string[]>            // 返回文件/目录名列表
  statModified(p: string): Promise<number>          // mtime 毫秒
  /** 元数据三件（M15 资源管理器视图）：字节大小 + 创建/修改时间毫秒（创建不可得时回退 mtime） */
  stat(p: string): Promise<FileStat>
  rename(a: string, b: string): Promise<void>       // 目标存在则替换
  remove(p: string): Promise<void>                  // Tauri 实现移入回收站
  exists(p: string): Promise<boolean>
  ensureDir(p: string): Promise<void>               // 递归建目录，已存在则成功
  readDirEntries(p: string): Promise<DirEntryInfo[]>  // 目录项名 + 是否目录（M5a 案头目录树用）
  mkdir(p: string): Promise<void>                    // 递归建目录，已存在则成功（幂等）
}

/** 目录项（readDirEntries 返回）：名字 + 是否目录 */
export interface DirEntryInfo { name: string; isDir: boolean }

/** 文件元数据（stat 返回，M15）：大小 + 创建/修改毫秒 */
export interface FileStat { size: number; createdAt: number; modifiedAt: number }
