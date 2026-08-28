import type { FsAdapter, MapInfo, Sidecar } from '../types/files'
import type { ZenNode } from '../types/tree'
import { serialize } from './mdTree'
import { writeSidecar } from './sidecar'
import { joinPath } from './workspace'

/** 导入时随 .md 一并落盘的初始 sidecar：与 workspace.ts 的 DEFAULT_SIDECAR 字面一致
 *  （该常量未从 workspace.ts 导出，按任务裁定在本文件内定义一次；主题/布局/画布均为初始值） */
const DEFAULT_SIDECAR: Sidecar = {
  version: 1,
  theme: 'default',
  layout: 'mindmap',
  collapsed: [],
  offsets: {},
  canvas: { x: 0, y: 0, zoom: 1 },
}

/** 导入 .md 复制入库（spec §8）：内容按规范序列化另存到工作区（非移动原文件），
 *  同名冲突自动加 `名称-YYYYMMDD-HHmm` 时间戳后缀；同一分钟内仍冲突（连续多次导入）
 *  再追加序号，循环直到名字空闲（任何情况都不覆盖既有导图），md + sidecar 齐全 */
export async function commitImport(
  fs: FsAdapter,
  wsDir: string,
  name: string,
  tree: ZenNode,
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
  await writeSidecar(fs, mdPath, DEFAULT_SIDECAR)
  return { name: finalName, mdPath, modifiedAt: await fs.statModified(mdPath) }
}
