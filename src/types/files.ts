// src/types/files.ts —— 文件系统抽象与工作区文件公共类型
export interface MapInfo { name: string; mdPath: string; modifiedAt: number }
export interface AppConfig { workspaceDir: string | null; lastOpened: string | null }
export const DEFAULT_CONFIG: AppConfig = { workspaceDir: null, lastOpened: null }
export interface Sidecar {
  version: 1
  theme: string
  layout: 'mindmap' | 'logic' | 'org'
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
}
