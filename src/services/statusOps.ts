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
 *  豁免说明：expand 直写不进 undo 历史——展开收起是视图导航态而非内容变更（回导图
 *  定位 onLocate 的「展开路径 + 居中」同款口径）；若走 SET_NODE_EXPAND 命令，「改一次
 *  状态」会裂成「展开 + 改状态」两步 undo，破坏看板操作的单步语义。safeReRender 保证
 *  渲染中不重入（双树错乱防护），渲染树重建后目标进入 findNodeByUid 可寻址集。 */
export function expandToUid(mm: MindMapHandle, uid: string): boolean {
  const path = findPathTo(mm.getData(), uid, [])
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
