// src/services/workbenchSuggest.ts —— 工作台规则建议引擎（spec §6）：四规则可解释、
// 名额 1/1/2/1、上限 5、低优先级不越位补位（做完了就是做完了，不硬凑建议）。
// 全纯函数：reasonKey 是 i18n key，文案渲染归视图层。
import type { WorkScan, WorkTask } from './workbench'

/** 图级停滞阈值（天）：模块常量，不做设置项（spec §6） */
export const STALE_MAP_DAYS = 7

export type SuggestionKind = 'finish' | 'blocked' | 'stale-todo' | 'stale-map'

export interface Suggestion {
  kind: SuggestionKind
  /** task 级建议（R1-R3）的跳转目标 */
  task?: WorkTask
  /** map 级建议（R4）的目标 */
  mapName?: string
  mapPath?: string
  reasonKey: string
}

/** R1 doing 取所属图 mtime 最新 1 条（最近在动的先收尾）；R2 blocked 取最旧 1 条
 *  （搁最久的等待最该催）；R3 todo 按所属图 mtime 升序至多 2（搁置最久的待办）；
 *  R4 工作/ 下 mtime 严格早于 now-7 天的图取最久 1 张（含无任务图——图本身停摆也该看） */
export function suggestNext(scan: WorkScan, now: number): Suggestion[] {
  const out: Suggestion[] = []
  const doing = scan.tasks.filter((t) => t.status === 'doing')
  if (doing.length > 0) {
    const pick = [...doing].sort((a, b) => b.mtime - a.mtime)[0]!
    out.push({ kind: 'finish', task: pick, reasonKey: 'workbench.suggest.finish' })
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
  const staleBefore = now - STALE_MAP_DAYS * 24 * 3600 * 1000
  const stale = scan.maps.filter((m) => m.mtime < staleBefore).sort((a, b) => a.mtime - b.mtime)
  const pick = stale[0]
  if (pick !== undefined) {
    out.push({ kind: 'stale-map', mapName: pick.mapName, mapPath: pick.mapPath, reasonKey: 'workbench.suggest.staleMap' })
  }
  return out.slice(0, 5)
}

/** AI 咨询上下文（spec §7）：聚合清单 + 规则建议 → 单条 user prompt。提示词用中文
 *  （模型指令语言与 UI 语言无关，BYOK 主流模型中文指令均可）。 */
export function buildSuggestPrompt(scan: WorkScan, suggestions: Suggestion[]): string {
  const lines: string[] = [
    '我用思维导图做工作管理。下面是所有任务（按图分组，方括号内是状态）和系统按 GTD 规则选出的建议。请给出 3-5 条「下一步该做什么」的具体建议，每条一两句话、直接可执行，不要泛泛而谈。',
  ]
  const byMap = new Map<string, WorkTask[]>()
  for (const t of scan.tasks) {
    const key = t.dirRel === '' ? t.mapName : `${t.mapName}（${t.dirRel}/）`
    const arr = byMap.get(key)
    if (arr === undefined) byMap.set(key, [t])
    else arr.push(t)
  }
  for (const [key, ts] of byMap) {
    lines.push(`\n图「${key}」的任务：`)
    for (const t of ts) {
      const path = t.path.length > 0 ? `（${t.path.join('/')}）` : ''
      lines.push(`- ${t.text} [${t.status}]${path}`)
    }
  }
  if (suggestions.length > 0) {
    lines.push('\n规则建议（供参考）：')
    for (const s of suggestions) {
      const target = s.task !== undefined ? `${s.task.mapName}：${s.task.text}` : `图「${s.mapName}」`
      lines.push(`- ${target} [${s.kind}]`)
    }
  }
  return lines.join('\n')
}
