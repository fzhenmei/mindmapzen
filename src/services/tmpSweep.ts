import type { FsAdapter } from '../types/files'

/** 原子写孤儿清扫（M3 缓期项，v0.7.0 真实泄漏实证）：
 *  writeTextFileAtomic 的 `<目标>.tmp-N` 若 rename 中途失败（进程被杀/写盘错误）会残留。
 *  案头视图无在途保存，此处安全；编辑器内不调用（可能撞上在途写的 tmp）。
 *  只清 .md/.zen.json 目标形态的 tmp（`x.md.tmp-3` / `x.zen.json.tmp-3`），防误删用户文件。 */
export async function sweepTmpOrphans(fs: FsAdapter, wsDir: string): Promise<number> {
  let removed = 0
  const entries = await fs.readDirEntries(wsDir).catch(() => [])
  for (const e of entries) {
    if (e.isDir) continue
    if (!/\.(md|zen\.json)\.tmp-\d+$/.test(e.name)) continue
    // 移入回收站而非永久删除（与 deleteMap 同语义）
    await fs.remove(`${wsDir.replace(/\/+$/, '')}/${e.name}`).catch(() => {})
    removed += 1
  }
  return removed
}
