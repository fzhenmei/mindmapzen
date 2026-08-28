import type { FsAdapter, LayoutKind, MapInfo } from '../types/files'
import type { ZenNode } from '../types/tree'
import { serialize } from './mdTree'
import { writeSidecar } from './sidecar'
import { DEFAULT_SIDECAR, joinPath } from './workspace'

/** 导入 .md 复制入库（spec §8）：内容按规范序列化另存到工作区（非移动原文件），
 *  同名冲突自动加 `名称-YYYYMMDD-HHmm` 时间戳后缀；同一分钟内仍冲突（连续多次导入）
 *  再追加序号，循环直到名字空闲（任何情况都不覆盖既有导图），md + sidecar 齐全 */
export async function commitImport(
  fs: FsAdapter,
  wsDir: string,
  name: string,
  tree: ZenNode,
  layout: LayoutKind = 'mindmap',
): Promise<MapInfo> {
  const stamp = () => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  }
  const s = stamp()
  let finalName = name
  let mdPath = joinPath(wsDir, finalName + '.md')
  let seq = 0
  while (await fs.exists(mdPath)) {
    seq += 1
    finalName = seq === 1 ? `${name}-${s}` : `${name}-${s}-${seq}`
    mdPath = joinPath(wsDir, finalName + '.md')
  }
  await fs.writeTextFileAtomic(mdPath, serialize(tree))
  await writeSidecar(fs, mdPath, { ...DEFAULT_SIDECAR, layout })
  return { name: finalName, mdPath, modifiedAt: await fs.statModified(mdPath) }
}
