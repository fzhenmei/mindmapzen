// src/services/workbench.ts —— 工作台（驾驶舱）聚合服务（spec 2026-09-13 §3）：工作/ 子树
// 全量 .md → 跨图任务索引。即时聚合：进入工作台时全量读、离开即弃——.md 唯一事实源，
// 无缓存无失效协议。卡片口径全同源 buildKanbanCards（有 status 才是卡/截断/未分组置顶），
// 状态与列口径零新增（TASK_STATUSES/BOARD_STATUSES 复用）。
import type { FsAdapter } from '../types/files'
import type { ZenNode } from '../types/tree'
import { parse } from './mdTree'
import { buildKanbanCards, type KanbanCard } from './kanban'
import { joinPath } from './workspace'

/** parse 产物不带 uid（uid 由引擎打开图时 uuidv4 现发、不落 .md），而 buildKanbanCards
 *  的出卡判定 isCardNode 要求 uid——扫描期无引擎，按树内序就地补确定性临时 uid：
 *  同图内容不变则 uid 不变（重聚合时卡片 React 键稳定）。该 uid 仅图内唯一、仅作
 *  React 行 key 与出卡判定，不可用于跨图寻址——跨图定位已改文本协议（path+text，
 *  spec §5/§11）；跨图列表 uid 会重复，Task 5/6 的 key 必须拼 mapPath。入参为
 *  parse 新鲜产物，就地赋值无共享变异风险 */
function assignUids(root: ZenNode): ZenNode {
  let seq = 0
  const walk = (n: ZenNode): void => {
    n.uid = `w${seq++}`
    for (const c of n.children) walk(c)
  }
  walk(root)
  return root
}

/** 工作目录约定（spec §1）：固定名、不可配置；其下所有图纳入驾驶舱聚合 */
export const WORK_DIR = '工作'

/** 工作/ 下图的元数据（含无任务图）：建议 R4 图级停滞与空态分层的数据源 */
export interface WorkMap {
  mapPath: string
  mapName: string
  /** 相对 工作/ 的目录段（'/' 分隔，''=直挂） */
  dirRel: string
  mtime: number
}

/** 跨图任务卡 = 单图看板卡 + 来源图四字段（spec §3） */
export interface WorkTask extends KanbanCard {
  mapPath: string
  mapName: string
  dirRel: string
  mtime: number
}

export interface WorkScan {
  /** 工作/ 是否存在（空态分层：false=引导创建，true=打标记引导） */
  dirExists: boolean
  maps: WorkMap[]
  tasks: WorkTask[]
  /** 读取/解析失败的图名（顶部提示条数据源） */
  failed: string[]
}

/** 单文件失败（IO/parse ok:false）进 failed 继续扫其余——聚合不因一图坏档中断；
 *  catch 有 console.error 显式出口（不吞异常红线），UI 侧提示条是第二出口 */
export async function scanWorkTasks(fs: FsAdapter, wsDir: string): Promise<WorkScan> {
  const workDir = joinPath(wsDir, WORK_DIR)
  if (!(await fs.exists(workDir))) return { dirExists: false, maps: [], tasks: [], failed: [] }
  const maps: WorkMap[] = []
  const tasks: WorkTask[] = []
  const failed: string[] = []
  const walk = async (dir: string, relDir: string): Promise<void> => {
    for (const e of await fs.readDirEntries(dir)) {
      if (e.isDir) {
        await walk(joinPath(dir, e.name), relDir === '' ? e.name : `${relDir}/${e.name}`)
        continue
      }
      if (!e.name.endsWith('.md')) continue
      const mapPath = joinPath(dir, e.name)
      const mapName = e.name.replace(/\.md$/, '')
      try {
        const mtime = (await fs.stat(mapPath)).modifiedAt
        maps.push({ mapPath, mapName, dirRel: relDir, mtime })
        const parsed = parse(await fs.readTextFile(mapPath))
        if (!parsed.ok) {
          failed.push(mapName)
          continue
        }
        for (const c of buildKanbanCards(assignUids(parsed.tree))) {
          tasks.push({ ...c, mapPath, mapName, dirRel: relDir, mtime })
        }
      } catch (e) {
        console.error('工作台聚合读取失败', mapPath, e)
        failed.push(mapName)
      }
    }
  }
  await walk(workDir, '')
  // 图 mtime 降序（与案头 listMaps 口径一致：最近动的图在前）
  maps.sort((a, b) => b.mtime - a.mtime)
  return { dirExists: true, maps, tasks, failed }
}
