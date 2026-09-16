// src/services/workbenchSuggest.ts —— 工作台规则建议引擎（spec §6）：五规则可解释、
// 名额 1/1/2/1/1、上限 6、低优先级不越位补位（做完了就是做完了，不硬凑建议）。
// 全纯函数：reasonKey 是 i18n key，文案渲染归视图层。
import type { WorkScan, WorkTask } from './workbench'

/** 图级停滞阈值（天）：模块常量，不做设置项（spec §6） */
export const STALE_MAP_DAYS = 7

/** WIP 超载阈值（条，严格大于才触发）：看板 WIP limit 口径——同时进行的事超过该数，
 *  R1 文案切超载变体提醒收敛（spec §6 v1.1，理论依据见 spec §12） */
export const WIP_WARN = 3

export type SuggestionKind = 'finish' | 'blocked' | 'stale-todo' | 'no-next' | 'stale-map'

/** 理由词条 key（字面量联合）：消费端 t(reasonKey) 的 key 空间由此收紧（i18next 严格类型） */
export type SuggestReasonKey =
  | 'workbench.suggest.finish'
  | 'workbench.suggest.finishOverload'
  | 'workbench.suggest.blocked'
  | 'workbench.suggest.staleTodo'
  | 'workbench.suggest.noNext'
  | 'workbench.suggest.staleMap'

export interface Suggestion {
  kind: SuggestionKind
  /** task 级建议（R1-R3）的跳转目标 */
  task?: WorkTask
  /** map 级建议（R4/R5）的目标 */
  mapName?: string
  mapPath?: string
  reasonKey: SuggestReasonKey
  /** WIP 计数：仅 finishOverload 词条插值 {{count}} 用（spec §6 v1.1） */
  count?: number
}

/** R1 doing 取所属图 mtime 最新 1 条（最近在动的先收尾；严格多于 WIP_WARN 条时文案切
 *  超载变体并带计数——先收敛再开新事，看板 WIP limit 口径）；R2 blocked 取最旧 1 条
 *  （搁最久的等待最该催）；R3 todo 按所属图 mtime 升序至多 2（搁置最久的待办）；
 *  R5 blocked-only 图（开放回路全部卡在等待、无 todo/doing 可推进）取 mtime 最久 1 张
 *  ——GTD「每个开放项目都要有下一步行动」的结构性停滞信号，比 R4 的时间性闲置更精确；
 *  R4 工作/ 下 mtime 严格早于 now-7 天的图取最久 1 张（含无任务图——图本身停摆也该看） */
export function suggestNext(scan: WorkScan, now: number): Suggestion[] {
  const out: Suggestion[] = []
  const doing = scan.tasks.filter((t) => t.status === 'doing')
  if (doing.length > 0) {
    const pick = [...doing].sort((a, b) => b.mtime - a.mtime)[0]!
    const overload = doing.length > WIP_WARN
    out.push({
      kind: 'finish',
      task: pick,
      reasonKey: overload ? 'workbench.suggest.finishOverload' : 'workbench.suggest.finish',
      ...(overload ? { count: doing.length } : {}),
    })
  }
  const blocked = scan.tasks.filter((t) => t.status === 'blocked')
  if (blocked.length > 0) {
    const pick = [...blocked].sort((a, b) => a.mtime - b.mtime)[0]!
    out.push({ kind: 'blocked', task: pick, reasonKey: 'workbench.suggest.blocked' })
  }
  const todos = scan.tasks.filter((t) => t.status === 'todo').sort((a, b) => a.mtime - b.mtime)
  for (const t of todos.slice(0, 2)) {
    out.push({ kind: 'stale-todo', task: t, reasonKey: 'workbench.suggest.staleTodo' })
  }
  // R5 按图聚合开放状态（todo/doing/blocked 计数）：blocked>0 且 todo=doing=0 才是
  // 「无下一步」——纯 done/dropped 图无开放回路，不算（做完了就是做完了）
  const openByMap = new Map<string, { todo: number; doing: number; blocked: number }>()
  for (const t of scan.tasks) {
    if (t.status !== 'todo' && t.status !== 'doing' && t.status !== 'blocked') continue
    const c = openByMap.get(t.mapPath) ?? { todo: 0, doing: 0, blocked: 0 }
    c[t.status] += 1
    openByMap.set(t.mapPath, c)
  }
  const noNext = scan.maps
    .filter((m) => {
      const c = openByMap.get(m.mapPath)
      return c !== undefined && c.blocked > 0 && c.todo === 0 && c.doing === 0
    })
    .sort((a, b) => a.mtime - b.mtime)[0]
  if (noNext !== undefined) {
    out.push({ kind: 'no-next', mapName: noNext.mapName, mapPath: noNext.mapPath, reasonKey: 'workbench.suggest.noNext' })
  }
  const staleBefore = now - STALE_MAP_DAYS * 24 * 3600 * 1000
  const stale = scan.maps.filter((m) => m.mtime < staleBefore).sort((a, b) => a.mtime - b.mtime)
  const pick = stale[0]
  if (pick !== undefined) {
    out.push({ kind: 'stale-map', mapName: pick.mapName, mapPath: pick.mapPath, reasonKey: 'workbench.suggest.staleMap' })
  }
  return out.slice(0, 6)
}

/** 任务按图分组（AI 上下文用）：key = 图名，子目录图带目录后缀 */
function groupTasksByMap(tasks: WorkTask[]): Map<string, WorkTask[]> {
  const byMap = new Map<string, WorkTask[]>()
  for (const t of tasks) {
    const key = t.dirRel === '' ? t.mapName : `${t.mapName}（${t.dirRel}/）`
    const arr = byMap.get(key)
    if (arr === undefined) byMap.set(key, [t])
    else arr.push(t)
  }
  return byMap
}

/** 建议行的 prompt 文本（- 目标 [kind]） */
function formatSuggestionLine(s: Suggestion): string {
  const target = s.task !== undefined ? `${s.task.mapName}：${s.task.text}` : `图「${s.mapName}」`
  return `- ${target} [${s.kind}]`
}

/** AI 咨询上下文（spec §7）：聚合清单 + 规则建议 → 单条 user prompt。提示词用中文
 *  （模型指令语言与 UI 语言无关，BYOK 主流模型中文指令均可）。 */
export function buildSuggestPrompt(scan: WorkScan, suggestions: Suggestion[]): string {
  const lines: string[] = [
    '我用思维导图做工作管理。下面是所有任务（按图分组，方括号内是状态）和系统按 GTD 规则选出的建议。请给出 3-5 条「下一步该做什么」的具体建议，每条一两句话、直接可执行，不要泛泛而谈。',
  ]
  for (const [key, ts] of groupTasksByMap(scan.tasks)) {
    lines.push(`\n图「${key}」的任务：`)
    for (const t of ts) {
      const path = t.path.length > 0 ? `（${t.path.join('/')}）` : ''
      lines.push(`- ${t.text} [${t.status}]${path}`)
    }
  }
  if (suggestions.length > 0) {
    lines.push('\n规则建议（供参考）：')
    for (const s of suggestions) lines.push(formatSuggestionLine(s))
  }
  return lines.join('\n')
}

/** AI 建议缓存 TTL（2026-09-14 双条件口径之一）：24h 内且指纹一致才复用，免重复请求 */
export const ADVICE_TTL_MS = 24 * 3600 * 1000

/** AI 建议缓存指纹（双条件口径之二）：任务清单内容签名（djb2 变体，32 位截断）。
 *  只签关键字段（来源图/uid/状态/文本）——uid 是聚合层确定性重计数，同内容稳定；
 *  mtime 不进指纹：图被动过但任务清单没变时建议仍有效（内容没变不过期） */
export function adviceFingerprint(scan: WorkScan): string {
  let h = 5381
  for (const t of scan.tasks) {
    const seg = `${t.mapPath}|${t.uid}|${t.status}|${t.text}|`
    for (let i = 0; i < seg.length; i++) h = ((h * 33) ^ (seg.codePointAt(i) ?? 0)) >>> 0
  }
  return h.toString(36)
}
