// src/services/desk.ts —— 案头目录服务（M5a）：目录树读取、递归建目录、导图移动
import type { FsAdapter, MapInfo } from '../types/files'
import { INVALID, joinPath, normalizeRel, resolveDir } from './workspace'

/** 目录树节点：path 为工作区相对路径（不含首尾斜杠，'/' 分隔）；根不出现在树中（「全部」项由 UI 提供） */
export interface DirNode { name: string; path: string; children: DirNode[] }

/** 递归读取工作区纯目录树：只含目录、空目录也保留（案头左树用）。
 *  每层按名称排序（中文走 zh-Hans-CN 拼音 collation）——与文件系统遍历序解耦，目录树渲染顺序确定 */
export async function readDirTree(fs: FsAdapter, wsDir: string): Promise<DirNode[]> {
  const walk = async (dir: string, rel: string): Promise<DirNode[]> => {
    const nodes: DirNode[] = []
    for (const e of await fs.readDirEntries(dir)) {
      if (!e.isDir) continue
      const path = rel === '' ? e.name : `${rel}/${e.name}`
      nodes.push({ name: e.name, path, children: await walk(joinPath(dir, e.name), path) })
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    return nodes
  }
  return walk(wsDir, '')
}

/** 递归建目录：'/' 为合法分隔符，逐段沿用 workspace INVALID 规则校验，非法段中文报错 */
export async function createDir(fs: FsAdapter, wsDir: string, relPath: string): Promise<void> {
  const segments = relPath.split('/').map((s) => s.trim()).filter((s) => s !== '')
  for (const seg of segments) {
    if (INVALID.test(seg)) throw new Error(String.raw`名称不能包含 \ / : * ? " < > |`)
  }
  if (segments.length > 0) await fs.mkdir(joinPath(wsDir, segments.join('/')))
}

/** 移动导图（.md + .zen.json 两文件同移）到目标目录；源 sidecar 缺失则只移 .md。
 *  同目录自碰撞守卫（Task 2 复审修复）：fromRel 与 toRel 归一后相同则早返回原 MapInfo——
 *  否则重名循环第一步就撞上源文件自身，会把导图误改名成 `名称-YYYYMMDD-HHmm`。
 *  目标重名后缀与 importMap.commitImport 同规则：先 `名称`，冲突 `名称-YYYYMMDD-HHmm`，
 *  同一分钟内仍冲突再追加 `-2/-3` 序号循环直到空闲（任何情况都不覆盖既有导图）；
 *  按计划 ruling 两处各自实现（注释互指），不抽公共函数 */
export async function moveMap(
  fs: FsAdapter,
  wsDir: string,
  name: string,
  fromRel: string,
  toRel: string,
): Promise<MapInfo> {
  const fromRelNorm = normalizeRel(fromRel)
  const toRelNorm = normalizeRel(toRel)
  const fromDir = resolveDir(wsDir, fromRelNorm)
  if (fromRelNorm === toRelNorm) {
    const mdPath = joinPath(fromDir, name + '.md')
    return { name, mdPath, relDir: toRelNorm, modifiedAt: await fs.statModified(mdPath) }
  }
  const toDir = resolveDir(wsDir, toRelNorm)
  await fs.ensureDir(toDir)
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
  let finalName = name
  let seq = 0
  while (await fs.exists(joinPath(toDir, finalName + '.md'))) {
    seq += 1
    finalName = seq === 1 ? `${name}-${stamp}` : `${name}-${stamp}-${seq}`
  }
  const newMdPath = joinPath(toDir, finalName + '.md')
  await fs.rename(joinPath(fromDir, name + '.md'), newMdPath)
  const oldSidecar = joinPath(fromDir, name + '.zen.json')
  if (await fs.exists(oldSidecar)) {
    await fs.rename(oldSidecar, joinPath(toDir, finalName + '.zen.json'))
  }
  return { name: finalName, mdPath: newMdPath, relDir: toRelNorm, modifiedAt: await fs.statModified(newMdPath) }
}
