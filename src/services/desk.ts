// src/services/desk.ts —— 案头目录服务（M5a）：目录树读取、递归建目录、导图移动
import type { FsAdapter, MapInfo } from '../types/files'
import { ASSETS_DIR } from './imageAssets'
import { INVALID, joinPath, normalizeRel, resolveDir, statTail } from './workspace'

/** 目录树节点：path 为工作区相对路径（不含首尾斜杠，'/' 分隔）；根不出现在树中（「全部」项由 UI 提供） */
export interface DirNode { name: string; path: string; children: DirNode[] }

/** 递归读取工作区纯目录树：只含目录、空目录也保留（案头左树用）。
 *  每层按名称排序（中文走 zh-Hans-CN 拼音 collation）——与文件系统遍历序解耦，目录树渲染顺序确定 */
export async function readDirTree(fs: FsAdapter, wsDir: string): Promise<DirNode[]> {
  const walk = async (dir: string, rel: string): Promise<DirNode[]> => {
    const nodes: DirNode[] = []
    for (const e of await fs.readDirEntries(dir)) {
      if (!e.isDir) continue
      // .git 不进案头目录树（M20 启用版本管理后工作区会出现；git 内部仓库非用户内容，
      // 左树与内容区文件夹 tile 同源本过滤）。只精确匹配 .git——不过滤其他点开头目录
      if (e.name === '.git') continue
      // 根层 assets 不进树（2026-09 保护）：插图资产目录（imageAssets.ASSETS_DIR）是
      // app 基础设施，非用户内容——树中隐去即所有管理面（选中/右键/移动目标）一并
      // 不可达；仅根层精确匹配，子目录里用户自建的同名目录仍是用户内容照常显示
      if (rel === '' && e.name === ASSETS_DIR) continue
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

/** 删除目录（2026-09 树右键）：整目录进回收站（Tauri trash::delete 递归语义，含全部
 *  后代导图与子目录）。rel 归一后为空（工作区根本体）抛错拒绝——删工作区须走设置页
 *  「退出工作区」流，不入本通道 */
export async function deleteDir(fs: FsAdapter, wsDir: string, rel: string): Promise<void> {
  const relNorm = normalizeRel(rel)
  if (relNorm === '') throw new Error('不能删除工作区根目录')
  await fs.remove(joinPath(wsDir, relNorm))
}

/** path 是否在 ancestor 子树内（含自身）：树拖拽落点守卫，组件 dragover 与服务层
 *  moveDir 共用。入参先归一（容首尾斜杠变体）；前缀须带 '/' 边界（'甲乙' 非 '甲' 子孙） */
export function isUnderDir(path: string, ancestor: string): boolean {
  const p = normalizeRel(path)
  const a = normalizeRel(ancestor)
  if (a === '') return true // 根子树即全工作区
  return p === a || p.startsWith(a + '/')
}

/** 移动目录（2026-09 树拖拽）：整子树 fs.rename 一步迁移（后代导图与子目录随走，上层
 *  refreshMaps + readDirTree 重建即可）。守卫链（同 reject-and-report 语义，中文报错走
 *  setError 提示）：根不可移；同目录早返回；目标是自身子孙拒绝；目标下同名目录拒绝
 *  （2026-09 拖拽策略裁决：不静默改名不合并，用户先改名再拖） */
export async function moveDir(
  fs: FsAdapter,
  wsDir: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  const fromRelNorm = normalizeRel(fromRel)
  const toRelNorm = normalizeRel(toRel)
  if (fromRelNorm === '') throw new Error('不能移动工作区根目录')
  if (fromRelNorm === toRelNorm) return
  if (isUnderDir(toRelNorm, fromRelNorm)) throw new Error('不能移动到自身或其子目录内')
  const toDir = resolveDir(wsDir, toRelNorm)
  const name = fromRelNorm.split('/').at(-1) ?? fromRelNorm
  if (await fs.exists(joinPath(toDir, name))) throw new Error('目标目录下已存在同名目录')
  await fs.rename(joinPath(wsDir, fromRelNorm), joinPath(toDir, name))
}

/** 目录子树内导图数（删除目录确认框报数）：所在层为其本身或以其为前缀 */
function countMapsInDir(maps: ReadonlyArray<{ relDir: string }>, rel: string): number {
  return maps.filter((m) => m.relDir === rel || m.relDir.startsWith(rel + '/')).length
}

/** 子树内是否还有子目录（删除目录确认框文案辅助：无导图但含子目录时不能说「为空」） */
function dirHasSubDirs(tree: DirNode[], rel: string): boolean {
  const find = (nodes: DirNode[]): DirNode | null => {
    for (const n of nodes) {
      if (n.path === rel) return n
      const hit = find(n.children)
      if (hit !== null) return hit
    }
    return null
  }
  return (find(tree)?.children.length ?? 0) > 0
}

/** 删除目录确认框说明文案：报子树内导图数（用户知情）；无导图但含子目录时如实相告；
 *  真空目录才说「为空」。供 DeleteConfirmDialog body */
export function dirDeleteSummary(
  maps: ReadonlyArray<{ relDir: string }>,
  tree: DirNode[],
  rel: string,
): string {
  const count = countMapsInDir(maps, rel)
  if (count > 0) return `该目录下 ${count} 张导图将随目录一并移入回收站。`
  if (dirHasSubDirs(tree, rel)) return '该目录下没有导图，但含子目录，将随目录一并移入回收站。'
  return '该目录为空，将直接移入回收站。'
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
    return { name, mdPath, relDir: toRelNorm, ...(await statTail(fs, mdPath)) }
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
  return { name: finalName, mdPath: newMdPath, relDir: toRelNorm, ...(await statTail(fs, newMdPath)) }
}

/** 树文件行的结构形状（DirectoryTree 的 TreeFile 同构；服务层不 import 组件层，
 *  结构类型即契约） */
interface TreeFileShape { name: string; relDir: string }

/** 工作区搜索过滤（v2.5 侧栏搜索框）：大小写不敏感包含匹配。语义——文件名命中 →
 *  保留该文件及其祖先目录链；目录名命中 → 整子树保留（其下文件全显）；无命中的
 *  目录分支剪除。q 去空格后为空原样返回（引用不变，未搜索时零成本）；返回新树
 *  节点（浅拷贝链），不改动入参 */
export function filterTree(
  tree: DirNode[],
  files: TreeFileShape[],
  rawQ: string,
): { tree: DirNode[]; files: TreeFileShape[] } {
  const q = rawQ.trim().toLowerCase()
  if (q === '') return { tree, files }
  const hit = (s: string) => s.toLowerCase().includes(q)

  // 目录命中区：命中目录及其全部后代 path（整子树保留区，区内文件无条件保留）
  const subtreePaths = new Set<string>()
  const collect = (n: DirNode) => {
    subtreePaths.add(n.path)
    n.children.forEach(collect)
  }
  tree.forEach((n) => { if (hit(n.name)) collect(n) })

  // 树修剪：区内整子树直过；区外目录保留「有命中后代（子目录或直接文件）」的最小链
  const keep = (n: DirNode): DirNode | null => {
    if (subtreePaths.has(n.path)) return n
    const kids = n.children.map(keep).filter((k): k is DirNode => k !== null)
    const hasHitFile = files.some((f) => f.relDir === n.path && hit(f.name))
    return kids.length === 0 && !hasHitFile ? null : { ...n, children: kids }
  }
  const keptTree = tree.map(keep).filter((k): k is DirNode => k !== null)
  const keptFiles = files.filter((f) => subtreePaths.has(f.relDir) || hit(f.name))
  return { tree: keptTree, files: keptFiles }
}
