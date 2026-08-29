// src/services/linkAdjust.ts —— 连线弯曲记忆纯函数（M5d Task 5）：sidecar linkAdjust 与引擎
// associativeLineTargetControlOffsets 之间的采集/恢复换算。无引擎/DOM 依赖（引擎树以 EngineNode 纯数据
// 形式传入）。引擎数据口径核验见 docs/notes/engine-api.md「M5d 核验 (d)」：
// offsets 挂在连线源节点 data 上，是按索引与 associativeLineTargets（目标 uid 数组）对齐的数组，
// 每项 [{x,y},{x,y}] = 两控制点相对连线起点/终点的差值（非 uid 键）。
import type { EngineNode } from '../types/engine'
import type { LinkAdjustEntry } from '../types/files'

/** sidecar linkAdjust 全表：路径对键 → 控制点差值 */
export type LinkAdjust = Record<string, LinkAdjustEntry>

/** 控制点差值（引擎原生口径） */
export interface ControlPointOffset {
  x: number
  y: number
}

/** 路径对键：'/源路径->/目标路径' */
export function adjustKey(fromPath: string, toPath: string): string {
  return `${fromPath}->${toPath}`
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 校验并原样返回引擎原生差值条目（[{x,y},{x,y}]）；形状/数字非法返回 undefined */
export function normalizeEngineOffsets(v: unknown): [ControlPointOffset, ControlPointOffset] | undefined {
  if (!Array.isArray(v) || v.length < 2) return undefined
  const [p1, p2] = v
  if (
    !p1 || !p2 || typeof p1 !== 'object' || typeof p2 !== 'object' ||
    !finite((p1 as ControlPointOffset).x) || !finite((p1 as ControlPointOffset).y) ||
    !finite((p2 as ControlPointOffset).x) || !finite((p2 as ControlPointOffset).y)
  ) {
    return undefined
  }
  return [p1 as ControlPointOffset, p2 as ControlPointOffset]
}

/** sidecar 条目 → 引擎差值对：缺省字段补 0（容错读已保证至少一个数字） */
export function adjustEntryToPair(e: LinkAdjustEntry | undefined): [ControlPointOffset, ControlPointOffset] | undefined {
  if (!e) return undefined
  return [
    { x: e.cx1 ?? 0, y: e.cy1 ?? 0 },
    { x: e.cx2 ?? 0, y: e.cy2 ?? 0 },
  ]
}

/** 采集（保存链）：引擎树 → linkAdjust。逐节点读 targets+offsets（索引对齐），目标 uid 失联（节点已删）
 *  与 offsets 空洞（该线从未拖弯）跳过；每次全量重建，改名/删线的旧路径键自然失联消失 */
export function collectLinkAdjust(engineRoot: EngineNode): LinkAdjust {
  const pathByUid = new Map<string, string>()
  const sources: Array<{ path: string; data: Record<string, unknown> }> = []
  const walk = (node: EngineNode, parentPath: string): void => {
    const text = String(node.data?.text ?? '')
    const path = parentPath === '' ? '/' + text : parentPath + '/' + text
    const { uid } = node.data as { uid?: unknown }
    if (typeof uid === 'string') pathByUid.set(uid, path)
    const targets = node.data?.associativeLineTargets
    if (Array.isArray(targets)) sources.push({ path, data: node.data as Record<string, unknown> })
    for (const child of node.children ?? []) walk(child, path)
  }
  walk(engineRoot, '')
  const adjust: LinkAdjust = {}
  for (const { path, data } of sources) {
    const targets = data.associativeLineTargets as unknown[]
    const offsets = data.associativeLineTargetControlOffsets
    if (!Array.isArray(offsets)) continue
    targets.forEach((uid, i) => {
      if (typeof uid !== 'string') return
      const toPath = pathByUid.get(uid)
      const pair = normalizeEngineOffsets(offsets[i])
      if (toPath === undefined || pair === undefined) return
      adjust[adjustKey(path, toPath)] = { cx1: pair[0].x, cy1: pair[0].y, cx2: pair[1].x, cy2: pair[1].y }
    })
  }
  return adjust
}

/** 恢复（重建连线）：源节点新 targets 逐位解析差值——引擎现存优先（保存链重建不回退刚拖的弯），
 *  失联回退 sidecar（路径对键）；两处皆无则该位 undefined（调用方对整表无一位落位的节点不写 offsets，
 *  有落位时须将空洞补成引擎默认差值保持数组稠密，见 MindMapCanvas.rebuildEngineLinks） */
export function resolveLinkOffsets(
  uids: readonly string[],
  fromPath: string,
  pathByUid: ReadonlyMap<string, string>,
  existingByUid: ReadonlyMap<string, [ControlPointOffset, ControlPointOffset]>,
  adjust?: LinkAdjust,
): Array<[ControlPointOffset, ControlPointOffset] | undefined> {
  return uids.map((uid) => {
    const existing = existingByUid.get(uid)
    if (existing !== undefined) return existing
    const toPath = pathByUid.get(uid)
    if (toPath === undefined || adjust === undefined) return undefined
    return adjustEntryToPair(adjust[adjustKey(fromPath, toPath)])
  })
}
