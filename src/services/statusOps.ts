// src/services/statusOps.ts —— 运行时状态读写纯函数（看板模式）
// 徽章互保协议：状态徽章（zen_status-<s>，kebab 而非下划线——引擎 getNodeIconListIcon
// 按 split('_') 全量拆分取 arr[1] 为 name，下划线形态永不命中）与用户图标（zen_*）
// 共存于 data.icon，任何一侧整组覆写都必须保留另一侧——本模块是唯一合成点。
import { TASK_STATUSES, type TaskStatus } from './statusMarkers'
import { findByUid } from '../hooks/useIconPicker'
import type { MindMapHandle } from '../types/engine'

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
