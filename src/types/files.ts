// src/types/files.ts —— 文件系统抽象与工作区文件公共类型
export interface MapInfo { name: string; mdPath: string; modifiedAt: number }

/** 语义布局三态（引擎名映射见 editor/layoutMap.ts；此处定义供 AppConfig/Sidecar 共用） */
export type LayoutKind = 'mindmap' | 'logic' | 'org'

const LAYOUT_KINDS = new Set<LayoutKind>(['mindmap', 'logic', 'org'])

/** 宽容解析配置中的布局偏好：非法/缺失返回 null */
export function parseLayoutKind(v: unknown): LayoutKind | null {
  return LAYOUT_KINDS.has(v as LayoutKind) ? (v as LayoutKind) : null
}

export interface AppConfig {
  workspaceDir: string | null
  lastOpened: string | null
  /** 用户偏好的默认布局（新建导图与无 sidecar 导图的初始布局）；null = 未设置（按 mindmap） */
  preferredLayout: LayoutKind | null
}
export const DEFAULT_CONFIG: AppConfig = { workspaceDir: null, lastOpened: null, preferredLayout: null }
export interface Sidecar {
  version: 1
  theme: string
  layout: LayoutKind
  collapsed: string[]
  offsets: Record<string, { dx: number; dy: number }>
  canvas: { x: number; y: number; zoom: number }
}
export interface FsAdapter {
  readTextFile(p: string): Promise<string>
  writeTextFileAtomic(p: string, contents: string): Promise<void>
  readDir(p: string): Promise<string[]>            // 返回文件/目录名列表
  statModified(p: string): Promise<number>          // mtime 毫秒
  rename(a: string, b: string): Promise<void>       // 目标存在则替换
  remove(p: string): Promise<void>                  // Tauri 实现移入回收站
  exists(p: string): Promise<boolean>
  ensureDir(p: string): Promise<void>               // 递归建目录，已存在则成功
}
