import type { FsAdapter, LayoutKind, MapInfo, Sidecar } from '../types/files'
import { parse, serialize } from './mdTree'
import { writeSidecar } from './sidecar'

/** 导图/目录名的非法字符集（desk.ts 的 createDir 等按段复用） */
export const INVALID = /[\\/:*?"<>|]/

/** 新建/导入导图时随 .md 一并落盘的默认 sidecar（主题/布局/画布均为初始值）。
 *  M4 缓期项清偿：导出供 importMap.ts 复用（原各自持有一份字面副本） */
export const DEFAULT_SIDECAR: Sidecar = {
  version: 1,
  theme: 'default',
  layout: 'mindmap',
  collapsed: [],
  offsets: {},
  canvas: { x: 0, y: 0, zoom: 1 },
  linkAdjust: {},
}

export async function listMaps(fs: FsAdapter, wsDir: string): Promise<MapInfo[]> {
  // M5a：递归列出工作区（含子目录）.md；relDir = mdPath 去掉 wsDir 前缀后的目录段（'/' 分隔归一）；
  // M15：每文件单次 stat 同时取 mtime/创建时间/大小（不再只 statModified）
  const found: Array<{ relDir: string; fileName: string; index: number; stat: { modifiedAt: number; createdAt: number; size: number } }> = []
  const walk = async (dir: string, relDir: string): Promise<void> => {
    for (const e of await fs.readDirEntries(dir)) {
      if (e.isDir) {
        await walk(joinPath(dir, e.name), relDir === '' ? e.name : `${relDir}/${e.name}`)
        continue
      }
      if (!e.name.endsWith('.md')) continue
      found.push({ relDir, fileName: e.name, index: found.length, stat: await fs.stat(joinPath(dir, e.name)) })
    }
  }
  await walk(wsDir, '')
  // mtime 降序；同一毫秒并列时，遍历序靠后者视为较新（内存 FS 中即更晚创建），保证排序稳定
  found.sort((a, b) => b.stat.modifiedAt - a.stat.modifiedAt || b.index - a.index)
  return found.map((e) => ({
    name: e.fileName.replace(/\.md$/, ''),
    mdPath: relToDir(wsDir, e.relDir, e.fileName),
    relDir: e.relDir,
    ...e.stat,
  }))
}

/** stat → MapInfo 元数据尾段（M15）：单次 stat 填满 modifiedAt/createdAt/size 三元；
 *  listMaps/createMap/importMap/moveMap 四构造点共用，防字段漂移 */
export async function statTail(fs: FsAdapter, mdPath: string): Promise<Pick<MapInfo, 'modifiedAt' | 'createdAt' | 'size'>> {
  const s = await fs.stat(mdPath)
  return { modifiedAt: s.modifiedAt, createdAt: s.createdAt, size: s.size }
}

/** 工作区 + 相对目录段 + 文件名 → 绝对路径（relDir 为空即根下） */
const relToDir = (wsDir: string, relDir: string, fileName: string): string =>
  relDir === '' ? joinPath(wsDir, fileName) : joinPath(wsDir, `${relDir}/${fileName}`)

export async function createMap(
  fs: FsAdapter,
  wsDir: string,
  name: string,
  layout: LayoutKind = 'mindmap',
  /** 模板 md（M16）：parse → 根节点文本替换为用户输入名 → serialize 落盘。
   *  缺省/解析失败回退 '# 根主题\n'（模板不合法不阻断创建） */
  templateContent?: string,
): Promise<MapInfo> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('名称不能为空')
  if (INVALID.test(trimmed)) throw new Error(String.raw`名称不能包含 \ / : * ? " < > |`)
  const mdPath = joinPath(wsDir, trimmed + '.md')
  if (await fs.exists(mdPath)) throw new Error(`已存在同名导图：${trimmed}`)
  let content = '# 根主题\n'
  if (templateContent !== undefined) {
    const r = parse(templateContent)
    if (r.ok) content = serialize({ ...r.tree, text: trimmed })
  }
  await fs.writeTextFileAtomic(mdPath, content)
  await writeSidecar(fs, mdPath, { ...DEFAULT_SIDECAR, layout })
  return { name: trimmed, mdPath, relDir: '', ...(await statTail(fs, mdPath)) }
}

/** 重命名导图（.md 与 .zen.json 同步改名）。relDir 为导图所在相对目录（'' = 工作区根）——
 *  M5a 终审修复：按所在目录拼路径，子目录导图不再误落到根下（根下同名图会被遮蔽误改） */
export async function renameMap(
  fs: FsAdapter,
  wsDir: string,
  relDir: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const trimmed = newName.trim()
  if (trimmed === '' || INVALID.test(trimmed)) throw new Error(String.raw`新名称非法（为空或包含 \ / : * ? " < > |）`)
  // 改成原名视作无操作，避免误报「已存在同名导图」
  if (trimmed === oldName) return
  const dir = resolveDir(wsDir, relDir)
  const oldMdPath = joinPath(dir, oldName + '.md')
  const newMdPath = joinPath(dir, trimmed + '.md')
  // 源缺失时给出中文错误，避免适配器底层英文异常外泄
  if (!(await fs.exists(oldMdPath))) throw new Error(`源导图不存在：${oldName}`)
  // 撞名预检：rename 是替换语义，直接改名会静默覆盖既有导图（且绕过回收站）
  if (await fs.exists(newMdPath)) throw new Error(`已存在同名导图：${trimmed}`)
  await fs.rename(oldMdPath, newMdPath)
  const oldSidecar = joinPath(dir, oldName + '.zen.json')
  if (await fs.exists(oldSidecar)) {
    await fs.rename(oldSidecar, joinPath(dir, trimmed + '.zen.json'))
  }
}

/** 删除导图（两文件一起 remove）。relDir 为导图所在相对目录（'' = 工作区根），同 renameMap 按目录拼路径 */
export async function deleteMap(fs: FsAdapter, wsDir: string, relDir: string, name: string): Promise<void> {
  const dir = resolveDir(wsDir, relDir)
  await fs.remove(joinPath(dir, name + '.md'))
  const sidecar = joinPath(dir, name + '.zen.json')
  if (await fs.exists(sidecar)) await fs.remove(sidecar)
}

export function joinPath(dir: string, name: string): string {
  let base = dir
  while (base.endsWith('/')) base = base.slice(0, -1)
  return base + '/' + name
}

/** 相对路径归一：去首尾斜杠（'' 即工作区根）。原为 desk.ts 本地副本，收敛至此单一实现（desk 反向 import 会成环） */
export const normalizeRel = (rel: string): string => {
  let r = rel
  while (r.startsWith('/')) r = r.slice(1)
  while (r.endsWith('/')) r = r.slice(0, -1)
  return r
}

/** 工作区 + 相对目录 → 目录绝对路径（归一后为 '' 时原样返回 wsDir，链式 joinPath 不产生双斜杠） */
export const resolveDir = (wsDir: string, relDir: string): string => {
  const r = normalizeRel(relDir)
  return r === '' ? wsDir : joinPath(wsDir, r)
}
