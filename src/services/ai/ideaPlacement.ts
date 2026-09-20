// src/services/ai/ideaPlacement.ts —— AI 推荐挂载位置（spec §6，M3）：独立于聊天面板，
// 复用 ai/client 的 transport（__AI_TRANSPORT_FACTORY__ 可注入）与 abort 语义。
// AI 只读不写（§6.4）：一切写入仍在用户确认后的 M1 挂载管线。
// 本文件分四层：摘要构建（Task 1）→ 解析容错与校验（Task 2）→ 两阶段编排（Task 3）
import type { ZenNode } from '../../types/tree'
import type { MountTarget } from '../basketMount'

/** 护栏常量（spec §6.4 初始建议值）：图数超限整批拒绝并显式提示；单图节点数超限细摘要截断标注 */
export const MAX_MAPS_FOR_AI = 50
export const MAX_NODES_PER_MAP = 200
/** 粗摘要字符上限（§6.2「逐图截断并标注超限」） */
export const COARSE_CHAR_CAP = 240

export interface CoarseMapSummary {
  mapPath: string
  name: string
  summary: string
  truncated: boolean
}

export interface FineMapSummary {
  mapPath: string
  name: string
  outline: string
  nodeCount: number
  truncated: boolean
}

/** 图名 = 尾段去 .md（与 BasketSortPanel.basenameOf 同口径；AI 提示里用可读名） */
function basenameOf(mdPath: string): string {
  const seg = mdPath.split(/[\\/]/).pop() ?? mdPath
  return seg.replace(/\.md$/i, '')
}

/** 粗摘要（§6.2 阶段①）：根文本 + 一层子节点文本（深层不进——控 token） */
export function buildCoarseSummary(mapPath: string, tree: ZenNode): CoarseMapSummary {
  const kids = tree.children.map((c) => c.text).join('、')
  const full = kids === '' ? tree.text : `${tree.text}：${kids}`
  const truncated = full.length > COARSE_CHAR_CAP
  const suffix = '…（截断）'
  return {
    mapPath,
    name: basenameOf(mapPath),
    // 截断给标注留位：COARSE_CHAR_CAP 是含标注在内的总长上限（§6.2「逐图截断并标注超限」）
    summary: truncated ? full.slice(0, COARSE_CHAR_CAP - suffix.length) + suffix : full,
    truncated,
  }
}

/** 数完全部节点（根在内），到 cap 即止（截断遍历，不数到底） */
function countAndCollect(node: ZenNode, cap: number, out: string[], depth: number): boolean {
  out.push(`${'  '.repeat(depth)}- ${node.text}`)
  if (out.length >= cap + 1) return false // cap+1：根占 1 个名额
  for (const c of node.children) {
    if (!countAndCollect(c, cap, out, depth + 1)) return false
  }
  return true
}

/** 细摘要（§6.2 阶段②）：完整缩进大纲，节点数上限护栏（超限截断标注，不静默） */
export function buildFineSummary(mapPath: string, tree: ZenNode, cap = MAX_NODES_PER_MAP): FineMapSummary {
  const lines: string[] = []
  const complete = countAndCollect(tree, cap, lines, 0)
  return {
    mapPath,
    name: basenameOf(mapPath),
    outline: lines.join('\n'),
    nodeCount: lines.length,
    truncated: !complete,
  }
}

/** 从模型原始输出提取 JSON（spec §6.3 容错）：优先 ```json 代码块，否则首个括号平衡的对象 */
export function extractJsonObject(raw: string): unknown {
  const candidate = findFenceContent(raw) ?? raw
  const start = candidate.indexOf('{')
  if (start === -1) return null
  const end = scanBalancedObject(candidate, start)
  if (end === -1) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

/** 代码块围栏（三个反引号） */
const FENCE = '```'

/** 取 raw 中首个完整代码块的内容（```json 或裸 ``` 围栏均可）；无完整围栏返回 null。
 *  手写 indexOf 扫描而非正则：围栏正则的惰性量词会触发 Sonar S8786 超线性回溯告警 */
function findFenceContent(raw: string): string | null {
  const open = raw.indexOf(FENCE)
  if (open === -1) return null
  const bodyStart = open + FENCE.length
  const close = raw.indexOf(FENCE, bodyStart)
  if (close === -1) return null
  return raw.slice(bodyStart, close)
}

/** 从 start 起扫描首个括号平衡对象的闭合下标（字符串与转义感知）；未闭合返回 -1。
 *  用 codePointAt 比较（引号 34 / 反斜杠 92 / 左花括号 123 / 右花括号 125） */
function scanBalancedObject(candidate: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < candidate.length; i++) {
    const code = candidate.codePointAt(i) ?? 0
    if (inString) {
      if (escaped) escaped = false
      else if (code === 92) escaped = true
      else if (code === 34) inString = false
      continue
    }
    if (code === 34) inString = true
    else if (code === 123) depth++
    else if (code === 125) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export interface AiCandidate {
  mapPath: string
  reason?: string
}

export interface AiPickRow {
  idea: string
  candidates: AiCandidate[]
}

/** 单个候选解析（从 parsePhase1 拆出以控认知复杂度）：形状不对返回 null */
function parseCandidate(c: unknown): AiCandidate | null {
  if (typeof c !== 'object' || c === null) return null
  const co = c as Record<string, unknown>
  if (typeof co.mapPath !== 'string') return null
  return { mapPath: co.mapPath, reason: typeof co.reason === 'string' ? co.reason : undefined }
}

/** phase1 输出解析：形状失型一律 null（调用方显式报错可重试，spec §6.3） */
export function parsePhase1(raw: string): AiPickRow[] | null {
  const root = extractJsonObject(raw)
  if (root === null || typeof root !== 'object') return null
  const arr = (root as { placements?: unknown }).placements
  if (!Array.isArray(arr)) return null
  const rows: AiPickRow[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) return null
    const o = item as Record<string, unknown>
    if (typeof o.idea !== 'string') return null
    if (!Array.isArray(o.candidates)) return null
    const candidates: AiCandidate[] = []
    for (const c of o.candidates) {
      const cand = parseCandidate(c)
      if (cand === null) return null
      candidates.push(cand)
    }
    rows.push({ idea: o.idea, candidates })
  }
  return rows
}

export interface AiPlacement {
  idea: string
  mapPath: string
  path: string[]
  reason?: string
}

/** phase2 输出解析：同 phase1 的形状严格性 */
export function parsePhase2(raw: string): AiPlacement[] | null {
  const root = extractJsonObject(raw)
  if (root === null || typeof root !== 'object') return null
  const arr = (root as { placements?: unknown }).placements
  if (!Array.isArray(arr)) return null
  const rows: AiPlacement[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) return null
    const o = item as Record<string, unknown>
    if (typeof o.idea !== 'string' || typeof o.mapPath !== 'string') return null
    if (!Array.isArray(o.path) || o.path.some((p) => typeof p !== 'string')) return null
    rows.push({
      idea: o.idea,
      mapPath: o.mapPath,
      path: o.path as string[],
      reason: typeof o.reason === 'string' ? o.reason : undefined,
    })
  }
  return rows
}

/** 细树全部节点链集合（'›' 连接，trim 后；含根链）——phase2 转换的比对面 */
export function collectPaths(tree: ZenNode): Set<string> {
  const out = new Set<string>()
  const walk = (node: ZenNode, chain: string[]) => {
    const text = node.text.trim()
    const next = [...chain, text]
    out.add(next.join('›'))
    for (const c of node.children) walk(c, next)
  }
  walk(tree, [])
  return out
}

/** 白名单 + 路径精确匹配（spec §6.3 硬约束）：trees 的键即白名单（喂给 AI 的清单）。
 *  AI 输出不可信——mapPath 未命中 / 路径链不存在都返回 null，调用方按 targetNotFound 口径
 * 留给用户手选；绝不绕过此校验直接构造 MountTarget。
 *  产出规范形态（basketMount.ts:9-12：path = 根→父的链、text = 目标自身）：AI 链含所选
 *  节点末项，转换去末项；链长 1（挂到根）保留 [根]——寻址要求非空链且链首 = 根文本 */
export function toMountTarget(p: AiPlacement, trees: Map<string, ZenNode>): MountTarget | null {
  const tree = trees.get(p.mapPath)
  if (tree === undefined) return null
  const chain = p.path.map((s) => s.trim())
  if (chain.includes('')) return null
  if (!collectPaths(tree).has(chain.join('›'))) return null
  const text = chain.at(-1)
  if (text === undefined) return null
  return {
    mapPath: p.mapPath,
    path: chain.length >= 2 ? chain.slice(0, -1) : chain,
    text,
  }
}
