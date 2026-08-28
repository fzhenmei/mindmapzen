import type { FsAdapter, MapInfo, Sidecar } from '../types/files'
import { writeSidecar } from './sidecar'

const INVALID = /[\\/:*?"<>|]/

/** 新建导图时随 .md 一并落盘的默认 sidecar（主题/布局/画布均为初始值） */
const DEFAULT_SIDECAR: Sidecar = {
  version: 1,
  theme: 'default',
  layout: 'mindmap',
  collapsed: [],
  offsets: {},
  canvas: { x: 0, y: 0, zoom: 1 },
}

export async function listMaps(fs: FsAdapter, wsDir: string): Promise<MapInfo[]> {
  const names = await fs.readDir(wsDir)
  const entries: Array<{ name: string; index: number; modifiedAt: number }> = []
  for (const [index, name] of names.entries()) {
    if (!name.endsWith('.md')) continue
    entries.push({ name, index, modifiedAt: await fs.statModified(joinPath(wsDir, name)) })
  }
  // mtime 降序；同一毫秒并列时，目录列表靠后者视为较新（内存 FS 中即更晚创建），保证排序稳定
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt || b.index - a.index)
  return entries.map((e) => ({
    name: e.name.replace(/\.md$/, ''),
    mdPath: joinPath(wsDir, e.name),
    modifiedAt: e.modifiedAt,
  }))
}

export async function createMap(fs: FsAdapter, wsDir: string, name: string): Promise<MapInfo> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('名称不能为空')
  if (INVALID.test(trimmed)) throw new Error(String.raw`名称不能包含 \ / : * ? " < > |`)
  const mdPath = joinPath(wsDir, trimmed + '.md')
  if (await fs.exists(mdPath)) throw new Error(`已存在同名导图：${trimmed}`)
  await fs.writeTextFileAtomic(mdPath, '# 根主题\n')
  await writeSidecar(fs, mdPath, DEFAULT_SIDECAR)
  return { name: trimmed, mdPath, modifiedAt: await fs.statModified(mdPath) }
}

export async function renameMap(fs: FsAdapter, wsDir: string, oldName: string, newName: string): Promise<void> {
  const trimmed = newName.trim()
  if (trimmed === '' || INVALID.test(trimmed)) throw new Error(String.raw`新名称非法（为空或包含 \ / : * ? " < > |）`)
  await fs.rename(joinPath(wsDir, oldName + '.md'), joinPath(wsDir, trimmed + '.md'))
  const oldSidecar = joinPath(wsDir, oldName + '.zen.json')
  if (await fs.exists(oldSidecar)) {
    await fs.rename(oldSidecar, joinPath(wsDir, trimmed + '.zen.json'))
  }
}

export async function deleteMap(fs: FsAdapter, wsDir: string, name: string): Promise<void> {
  await fs.remove(joinPath(wsDir, name + '.md'))
  const sidecar = joinPath(wsDir, name + '.zen.json')
  if (await fs.exists(sidecar)) await fs.remove(sidecar)
}

function joinPath(dir: string, name: string): string {
  let base = dir
  while (base.endsWith('/')) base = base.slice(0, -1)
  return base + '/' + name
}
