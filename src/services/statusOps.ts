// src/services/statusOps.ts —— 运行时状态读写纯函数（看板模式）
// 徽章互保协议：状态徽章（zen_status-<s>，kebab 而非下划线——引擎 getNodeIconListIcon
// 按 split('_') 全量拆分取 arr[1] 为 name，下划线形态永不命中）与用户图标（zen_*）
// 共存于 data.icon，任何一侧整组覆写都必须保留另一侧——本模块是唯一合成点。
import { TASK_STATUSES, type TaskStatus } from './statusMarkers'
import { findByUid } from '../hooks/useIconPicker'
import { safeReRender } from '../editor/zenIcons'
import type { EngineNode, MindMapHandle } from '../types/engine'

const BADGE_PREFIX = 'zen_status-'

/** 现有 icon 数组 + 目标状态 → 合成覆写数组（徽章恒居首；null = 清除状态）。
 *  旧徽章（含白名单外）一律滤除，由目标状态重新合成；非字符串项（引擎杂质）滤除 */
export function mergeStatusBadge(currentIcon: unknown, status: TaskStatus | null): string[] {
  const userIcons = Array.isArray(currentIcon)
    ? currentIcon.filter((i): i is string => typeof i === 'string' && !i.startsWith(BADGE_PREFIX))
    : []
  return status === null ? userIcons : [`${BADGE_PREFIX}${status}`, ...userIcons]
}

/** 读引擎节点当前状态（首个徽章裁决 + 白名单校验，与 mdTree engineTreeToZen
 *  「首个 zen_status- 命中项、白名单外宽容丢弃」口径一致；无徽章/未命中 null） */
export function nodeStatusOf(mm: MindMapHandle | null, uid: string | null): TaskStatus | null {
  const node = mm !== null ? findByUid(mm.getData(), uid) : null
  const icon = node !== null ? node.data.icon : undefined
  if (!Array.isArray(icon)) return null
  for (const i of icon) {
    if (typeof i === 'string' && i.startsWith(BADGE_PREFIX)) {
      const s = i.slice(BADGE_PREFIX.length)
      return TASK_STATUSES.includes(s as TaskStatus) ? (s as TaskStatus) : null
    }
  }
  return null
}

/** 数据树 DFS 收集 uid 命中路径（根→目标，含收起隐藏子树）；未命中返回 null */
function findPathTo(node: EngineNode, uid: string, acc: EngineNode[]): EngineNode[] | null {
  acc.push(node)
  if (node.data.uid === uid) return acc
  for (const c of node.children ?? []) {
    const hit = findPathTo(c, uid, acc)
    if (hit !== null) return hit
  }
  acc.pop()
  return null
}

/** 展开通往 uid 的收起祖先（data.expand=false 直写 true），有展开则 safeReRender
 *  并返回 true；路径已全展开或数据树未命中返回 false。
 *  数据树必须走 renderer.renderTree（引擎活树）：mm.getData() 是 copyRenderTree 深拷贝
 *  副本（Command.js getCopyData），直写副本不落引擎、重渲后收起分支依旧不可寻址
 *  （2026-09-13 批量归档遗留卡真机实锤：单卡收起分支改状态同病，单测 fake 的
 *  getData 同引用曾掩盖——引擎侧探针证据为两次 expandToUid 均 true）。
 *  豁免说明：expand 直写不进 undo 历史——展开收起是视图导航态而非内容变更（回导图
 *  定位 onLocate 的「展开路径 + 居中」同款口径）；若走 SET_NODE_EXPAND 命令，「改一次
 *  状态」会裂成「展开 + 改状态」两步 undo，破坏看板操作的单步语义。safeReRender 保证
 *  渲染中不重入（双树错乱防护），渲染树重建后目标进入 findNodeByUid 可寻址集。 */
export function expandToUid(mm: MindMapHandle, uid: string): boolean {
  const root = mm.renderer?.renderTree
  if (root === null || root === undefined) return false
  const path = findPathTo(root, uid, [])
  if (path === null) return false
  let expanded = false
  // 目标自身的 expand 无关（改 icon/text 不涉其子树），只展开祖先链
  for (const ancestor of path.slice(0, -1)) {
    if (ancestor.data.expand === false) {
      ancestor.data.expand = true
      expanded = true
    }
  }
  if (expanded) safeReRender(mm)
  return expanded
}

/** 收起分支展开后渲染树重试上限：safeReRender 渲染中场景首轮事件新树未建，需等
 *  其排的重渲完成（1 次重挂即够，上限是防异常树死循环）。导出供 EditorView.locateNode
 *  同口径复用（首挂定位 miss 重试） */
export const RENDER_RETRY_MAX = 3

/** 渲染节点寻址落命令（2026-09 审查 Important-2 自 KanbanView.withRenderNode 提升，
 *  KanbanView 三操作与 useIconPicker/useTagPicker 桥接同用）：渲染树命中即同步落命令；
 *  miss 时先 expandToUid 展开数据树上的收起祖先（expand 直写不进 undo——视图导航
 *  豁免，见 expandToUid 注释），经 node_tree_render_end 回调在新树上重试。重试有限次：
 *  safeReRender 在「引擎渲染中」场景会先排一轮重渲（其回调先于本回调执行），首轮事件
 *  时新树可能未建，miss 则重挂等待下一轮。数据树也无此 uid（垃圾 uid）时 console.error
 *  显式出口。回调内自兜 try/catch：引擎事件回调的异常运行时只静默吞（无框架兜底）。
 *  模块依赖注：本模块 import findByUid（hooks/useIconPicker），useIconPicker/useTagPicker
 *  反向 import 本函数——ESM 循环但两侧顶层互不取值（均为函数体内调用），安全 */
export function execOnRenderNode(
  mm: MindMapHandle | null,
  uid: string,
  label: string,
  apply: (node: unknown) => void,
): void {
  if (mm === null) return
  const found = mm.renderer?.findNodeByUid(uid)
  if (found !== null && found !== undefined) {
    apply(found)
    return
  }
  // expandToUid 的 false 双语义分流（2026-09 批量归档遗留卡修复）：数据树无此节点
  // （真垃圾 uid）报错丢弃；路径已全展开但渲染树未跟上（前序操作刚展开、重渲未完成
  // ——批量归档同收起分支第二张起的形态）转入下方渲染完成回调等待，不丢命令。
  // 台账「三分返回值」的消费侧等价实现：不动 expandToUid 签名与其余调用点
  if (!expandToUid(mm, uid)) {
    if (findByUid(mm.getData(), uid) === null) {
      console.error(`${label}失败：数据树中无此节点`, uid)
      return
    }
  }
  let tries = 0
  const onEnd = (): void => {
    mm.off('node_tree_render_end', onEnd)
    try {
      const node = mm.renderer?.findNodeByUid(uid)
      if (node === null || node === undefined) {
        if (tries < RENDER_RETRY_MAX) {
          tries += 1
          mm.on('node_tree_render_end', onEnd)
          return
        }
        console.error(`${label}失败：展开重渲后仍未找到渲染节点`, uid)
        return
      }
      apply(node)
    } catch (e) {
      // 引擎事件回调内的异常运行时只静默吞（无框架兜底），自兜留痕
      console.error(`${label}回调失败`, e)
    }
  }
  mm.on('node_tree_render_end', onEnd)
}

/** 工作台跨图定位的文本寻址输入树（引擎全量树最小只读面：data.text/data.uid/children）。
 *  uid 收宽为 unknown：引擎 data 带字符串索引签名（EngineNode），uid 类型侧不可精化，
 *  运行时恒 string——命中处以 typeof 收窄，EngineNode 无需断言即可入参 */
type AddrNode = { data: { text: string; uid?: unknown }; children?: AddrNode[] }

/** 工作台跨图定位的文本寻址（spec 2026-09-13 §5）：md 不序列化 uid，扫描期 uid 在引擎
 *  侧必然失配——按「大纲路径段 + 节点文本」在引擎全量树 DFS 命中第一个节点取真 uid。
 *  入参即引擎树形态，getData() 快照与 renderTree 皆可（含收起隐藏子树——收起只改
 *  data.expand 不摘 children）；只读寻址不写树（收起分支事故的教训是「直写副本」，
 *  读快照安全）。同名歧义取 DFS 首个（path 前缀收窄歧义面，miss 由调用方 console.warn
 *  兜底） */
export function findUidByPathText(root: AddrNode, path: readonly string[], text: string): string | null {
  const walk = (node: AddrNode, depth: number): string | null => {
    for (const c of node.children ?? []) {
      if (depth < path.length) {
        if (c.data.text === path[depth]) {
          const hit = walk(c, depth + 1)
          if (hit !== null) return hit
        }
      } else if (c.data.text === text && typeof c.data.uid === 'string') {
        return c.data.uid
      }
    }
    return null
  }
  return walk(root, 0)
}
