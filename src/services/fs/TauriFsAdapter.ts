import { exists, mkdir, readDir, readTextFile, rename, stat, writeTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import type { FsAdapter } from '../../types/files'

export const tauriFsAdapter: FsAdapter = {
  async readTextFile(p) {
    return readTextFile(p)
  },
  async writeTextFileAtomic(p, contents) {
    const tmp = p + '.tmp'
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
}
