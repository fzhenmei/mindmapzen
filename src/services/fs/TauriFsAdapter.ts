import { exists, mkdir, readDir, readTextFile, rename, stat, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import type { FileStat, FsAdapter } from '../../types/files'

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
  // 二进制整文件覆盖写（M5b Task 5 导出）：plugin-fs writeFile 直收 Uint8Array（engine-api.md「M5b 核验 (c)」）
  async writeBytes(p, bytes) {
    await writeFile(p, bytes)
  },
  async readDir(p) {
    const entries = await readDir(p)
    return entries.map((e) => e.name)
  },
  async statModified(p) {
    const s = await stat(p)
    return s.mtime?.getTime() ?? 0
  },
  // plugin-fs stat：size 字节 + mtime/birthtime Date|null（M15 核验，dist-js index.d.ts）
  async stat(p): Promise<FileStat> {
    const s = await stat(p)
    const modifiedAt = s.mtime?.getTime() ?? 0
    // birthtime 跨平台不可得（如部分 Linux 文件系统）时回退 mtime，展示层语义保守
    return { size: s.size, createdAt: s.birthtime?.getTime() ?? modifiedAt, modifiedAt }
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
