import { exists, mkdir, readDir, readTextFile, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import type { FsAdapter } from '../../types/files'

// 临时名自增序号：内容保存与布局 sidecar 即时落盘可能并发写同一目标文件，
// 固定 .tmp 会在 rename 上互抢（覆盖/误失败），唯一临时名保证互不干扰
let tmpSeq = 0

export const tauriFsAdapter: FsAdapter = {
  async readTextFile(p) {
    return readTextFile(p)
  },
  async writeTextFileAtomic(p, contents) {
    const tmp = `${p}.tmp-${++tmpSeq}`
    await writeTextFile(tmp, contents)
    await rename(tmp, p)
  },
  async readDir(p) {
    const entries = await readDir(p)
    return entries.map((e) => e.name)
  },
  async statModified(p) {
    const s = await stat(p)
    return s.mtime?.getTime() ?? 0
  },
  async rename(a, b) {
    await rename(a, b)
  },
  async remove(p) {
    await invoke('trash_delete', { path: p })
  },
  async exists(p) {
    return exists(p)
  },
  async ensureDir(p) {
    // recursive 建目录；已存在视为成功
    await mkdir(p, { recursive: true })
  },
  async readDirEntries(p) {
    // plugin-fs DirEntry 的 isDirectory 即「是否目录」标记
    const entries = await readDir(p)
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory }))
  },
  async mkdir(p) {
    // recursive：已存在视为成功（幂等）
    await mkdir(p, { recursive: true })
  },
}
