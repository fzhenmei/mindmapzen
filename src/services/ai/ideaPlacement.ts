// src/services/ai/ideaPlacement.ts —— AI 推荐挂载位置（spec §6，M3）：独立于聊天面板，
// 复用 ai/client 的 transport（__AI_TRANSPORT_FACTORY__ 可注入）与 abort 语义。
// AI 只读不写（§6.4）：一切写入仍在用户确认后的 M1 挂载管线。
// 本文件分四层：摘要构建（Task 1）→ 解析容错与校验（Task 2）→ 两阶段编排（Task 3）
import type { ZenNode } from '../../types/tree'
import type { MountTarget } from '../basketMount'
import { getTransport, parseDeltaChunk, type AiTransport } from './client'
import { readMapTree, type BasketIdea } from '../basket'
import type { AiConfig, FsAdapter } from '../../types/files'

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

// ── 两阶段编排（Task 3，spec §6.1/§6.2）──
// 编排语义：
// 1. 护栏：图数超 MAX_MAPS_FOR_AI 整批拒绝（不截断不静默）；
// 2. 读全部图树，读失败的图剔除出清单（AI 拿不到就推荐不到，无额外出口——数量在结果里体现）；
// 3. phase1 粗摘要清单 + 点子列表 → 单次流式调用 → 解析失败整批 parseFailed；
// 4. 候选归并：每点子取候选 ∩ 白名单（readTree 成功的 mapPath 集合），空 → 该行 noCandidate；
// 5. phase2 全部候选图（去重）细摘要 → 单次流式调用（prompt 含每点子候选路径）→ 解析失败整批 parseFailed；
// 6. 逐点子按 idea 文本（trim）对位 phase2 行 → toMountTarget（白名单+精确路径）→ null 即 targetNotFound
//    （spec §6.3：白名单未命中与路径不匹配同口径，留给用户手选兜底）；
// 7. transport endedWith=error → requestFailed（带 message）；aborted → aborted（本地掐流不是故障）；
// 8. 两阶段共用注入的同一个 transport 实例（一次 abort 掐在途的那一轮）；每阶段流式文本收全再整体解析。

export type PlacementFailure = 'tooManyMaps' | 'parseFailed' | 'requestFailed' | 'aborted'

export type PlacementRow =
  | { idea: BasketIdea; target: MountTarget; reason?: string }
  | { idea: BasketIdea; failed: 'noCandidate' | 'targetNotFound' }

export interface AskPlacementInput {
  ideas: BasketIdea[]
  maps: string[]
  ai: AiConfig
  workspaceDir: string
  fs: FsAdapter
}

export interface AskPlacementPorts {
  transport?: AiTransport
  readTree?(mapPath: string): Promise<ZenNode | null>
}

// prompt 常量为模型面而非 UI 面——中文硬编码，不走 i18n
/** phase1 选图 prompt：粗摘要清单 + 点子列表 */
function phase1Prompt(summaries: CoarseMapSummary[], ideas: BasketIdea[]): string {
  const lines = [
    '你是导图整理助手。下面是工作区的导图清单（路径与摘要）和待整理的点子。',
    '为每个点子从导图中选出 1~3 个最合适的挂载候选图（按合适程度排序）。',
    '只输出 JSON，不要任何多余文本，格式：',
    '{"placements":[{"idea":"<点子原文>","candidates":[{"mapPath":"<图路径原样照抄>","reason":"<一句理由>"}]}]}',
    'mapPath 必须原样照抄清单中的路径。导图清单：',
    ...summaries.map((s) => `- ${s.mapPath}《${s.name}》${s.summary}`),
    '点子列表：',
    ...ideas.map((i) => `- ${i.text}`),
  ]
  return lines.join('\n')
}

/** phase2 定位 prompt：候选图细摘要大纲 + 各点子的候选路径 */
function phase2Prompt(fines: FineMapSummary[], ideas: BasketIdea[], candidatesByIdea: Map<string, string[]>): string {
  const lines = [
    '你是导图整理助手。为每个点子在其候选图中选出挂载节点（新点子将挂为该节点的子节点）。',
    '输出该节点的完整文本路径 path：从根节点文本开始、到所选节点自身结束的每一级文本。',
    '只输出 JSON，不要任何多余文本，格式：',
    '{"placements":[{"idea":"<点子原文>","mapPath":"<图路径原样照抄>","path":["<根文本>",...,"<所选节点文本>"],"reason":"<一句理由>"}]}',
    'path 必须与大纲中的节点文本逐字一致。候选图大纲：',
    ...fines.map((f) => `## ${f.mapPath}\n${f.outline}`),
    '点子列表（含各自候选图路径）：',
    ...ideas.map((i) => `- ${i.text}（候选：${(candidatesByIdea.get(i.text.trim()) ?? []).join('、')}）`),
  ]
  return lines.join('\n')
}

/** 单阶段流式调用：收全量文本再返回（两阶段的输出都是一次性 JSON，无流式渲染需求） */
async function askOnce(
  transport: AiTransport,
  ai: AiConfig,
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: 'requestFailed' | 'aborted'; message?: string }> {
  let base = ai.baseUrl
  while (base.endsWith('/')) base = base.slice(0, -1)
  let acc = ''
  const outcome = await transport.start(
    {
      url: `${base}/chat/completions`,
      apiKey: ai.apiKey,
      body: { model: ai.model, messages: [{ role: 'user', content: prompt }], stream: true },
    },
    (data) => {
      const parsed = parseDeltaChunk(data)
      if (parsed?.text !== undefined) acc += parsed.text
    },
  )
  if (outcome.endedWith === 'error') return { ok: false, error: 'requestFailed', message: outcome.errorMessage }
  if (outcome.endedWith === 'aborted') return { ok: false, error: 'aborted' }
  return { ok: true, text: acc }
}

/** 读全部图树建白名单（语义 2）：读失败的图剔除——AI 拿不到就推荐不到，数量在结果里体现 */
async function readTrees(readTree: NonNullable<AskPlacementPorts['readTree']>, maps: string[]): Promise<Map<string, ZenNode>> {
  const trees = new Map<string, ZenNode>()
  for (const mapPath of maps) {
    const tree = await readTree(mapPath)
    if (tree !== null) trees.set(mapPath, tree)
  }
  return trees
}

/** 候选归并（语义 4）：每点子取候选 ∩ 白名单，产出候选路径表与待定位集合；对位键 = 点子文本 trim */
function mergeCandidates(ideas: BasketIdea[], picks: AiPickRow[], trees: Map<string, ZenNode>): { candidatesByIdea: Map<string, string[]>; pendingSet: Set<BasketIdea> } {
  const byIdea = new Map<string, AiPickRow>()
  for (const row of picks) byIdea.set(row.idea.trim(), row)
  const candidatesByIdea = new Map<string, string[]>()
  const pendingSet = new Set<BasketIdea>()
  for (const idea of ideas) {
    const pick = byIdea.get(idea.text.trim())
    const cands = (pick?.candidates ?? []).map((c) => c.mapPath).filter((m) => trees.has(m))
    if (cands.length === 0) continue
    candidatesByIdea.set(idea.text.trim(), cands)
    pendingSet.add(idea)
  }
  return { candidatesByIdea, pendingSet }
}

/** 阶段② 定位（语义 5）：候选图（去重）细摘要 → 单次调用 → 按 trim 键建对位表；无待定点子空表直出；
 *  失败原样上抛（requestFailed/aborted/parseFailed 整批口径） */
async function runPhase2(
  transport: AiTransport,
  ai: AiConfig,
  trees: Map<string, ZenNode>,
  candidatesByIdea: Map<string, string[]>,
  pending: BasketIdea[],
): Promise<{ ok: true; placeByIdea: Map<string, AiPlacement> } | { ok: false; error: 'parseFailed' | 'requestFailed' | 'aborted'; message?: string }> {
  const placeByIdea = new Map<string, AiPlacement>()
  if (pending.length === 0) return { ok: true, placeByIdea }
  const fineSet = new Set<string>()
  for (const list of candidatesByIdea.values()) for (const m of list) fineSet.add(m)
  const fines = [...fineSet].map((mapPath) => buildFineSummary(mapPath, trees.get(mapPath)!))
  const p2 = await askOnce(transport, ai, phase2Prompt(fines, pending, candidatesByIdea))
  if (!p2.ok) return p2
  const places = parsePhase2(p2.text)
  if (places === null) return { ok: false, error: 'parseFailed' }
  for (const p of places) placeByIdea.set(p.idea.trim(), p)
  return { ok: true, placeByIdea }
}

/** 按输入顺序组装 rows（语义 6）：noCandidate / targetNotFound / 成功同行同序 */
function buildRows(ideas: BasketIdea[], pendingSet: Set<BasketIdea>, placeByIdea: Map<string, AiPlacement>, trees: Map<string, ZenNode>): PlacementRow[] {
  return ideas.map((idea) => {
    if (!pendingSet.has(idea)) return { idea, failed: 'noCandidate' as const }
    const p = placeByIdea.get(idea.text.trim())
    // 白名单 + 路径精确匹配（§6.3 硬约束）：p 缺席与 toMountTarget 为 null 同口径——一律
    // targetNotFound，用户手选兜底（早退写法保住窄化，三元汇合流会让 p 回到 possibly undefined）
    if (p === undefined) return { idea, failed: 'targetNotFound' as const }
    const target = toMountTarget(p, trees)
    if (target === null) return { idea, failed: 'targetNotFound' as const }
    return { idea, target, reason: p.reason }
  })
}

/** 两阶段编排入口：选图（phase1）→ 定位（phase2），rows 按输入序组装（成功/失败同行同序） */
export async function askPlacement(
  input: AskPlacementInput,
  ports: AskPlacementPorts = {},
): Promise<{ ok: true; rows: PlacementRow[] } | { ok: false; error: PlacementFailure; message?: string }> {
  if (input.maps.length > MAX_MAPS_FOR_AI) return { ok: false, error: 'tooManyMaps' }
  const transport = ports.transport ?? getTransport()
  const readTree = ports.readTree ?? (async (mapPath) => readMapTree(input.fs, mapPath))
  const trees = await readTrees(readTree, input.maps)
  if (trees.size === 0) return { ok: true, rows: input.ideas.map((idea) => ({ idea, failed: 'noCandidate' as const })) }
  // 阶段① 选图（语义 3）
  const p1 = await askOnce(transport, input.ai, phase1Prompt([...trees.entries()].map(([mapPath, tree]) => buildCoarseSummary(mapPath, tree)), input.ideas))
  if (!p1.ok) return p1
  const picks = parsePhase1(p1.text)
  if (picks === null) return { ok: false, error: 'parseFailed' }
  const { candidatesByIdea, pendingSet } = mergeCandidates(input.ideas, picks, trees)
  const p2 = await runPhase2(transport, input.ai, trees, candidatesByIdea, [...pendingSet])
  if (!p2.ok) return p2
  return { ok: true, rows: buildRows(input.ideas, pendingSet, p2.placeByIdea, trees) }
}
