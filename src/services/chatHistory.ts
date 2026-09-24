// src/services/chatHistory.ts —— AI 对话历史持久化（2026-09）：sidecar 流水追加模型。
// 文件 <name>.zen.chat.json 是这张图的完整对话流水（user/assistant + 操作卡片），回合收尾
// 追加（read → 合并 → 原子整写）；UI 是否载入由用户定，文件永远全量顺序——「重新开始」
// 只影响回传上下文，历史不丢，下次打开仍提醒。error/notice 不入档：会话级噪音
// （notice v1 起即设计为不持久化），过滤口径与回传窗口一致。
import type { FsAdapter } from '../types/files'
import type { ChatMessage, ToolCardData } from '../store/chatStore'

/** 持久化消息条目：ChatMessage 的存储投影——id 不存（载入时重排，仅会话内标识），
 *  rendered/cardsCollapsed/cardsWindowed 是 UI 瞬态（载入时统一收起） */
export interface PersistedChatMessage {
  role: 'user' | 'assistant'
  text: string
  cards?: ToolCardData[]
}

export function chatHistoryPathOf(mdPath: string): string {
  return mdPath.replace(/\.md$/, '') + '.zen.chat.json'
}

/** 宽容解析卡片：kind/ok/text 任一失型整条丢弃（未知 kind 保留——渲染层 cardText 有回退） */
function parseCard(v: unknown): ToolCardData | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.kind !== 'string' || typeof o.ok !== 'boolean' || typeof o.text !== 'string') return null
  return { kind: o.kind as ToolCardData['kind'], ok: o.ok, text: o.text }
}

/** 宽容解析消息数组：非数组 → []；逐条校验 role ∈ {user,assistant} 且 text 字符串，失型条目丢弃 */
export function parseChatMessages(v: unknown): PersistedChatMessage[] {
  if (!Array.isArray(v)) return []
  const out: PersistedChatMessage[] = []
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    if ((o.role !== 'user' && o.role !== 'assistant') || typeof o.text !== 'string') continue
    const cards = Array.isArray(o.cards) ? o.cards.map(parseCard).filter((c): c is ToolCardData => c !== null) : undefined
    out.push(cards !== undefined && cards.length > 0 ? { role: o.role, text: o.text, cards } : { role: o.role, text: o.text })
  }
  return out
}

/** 读历史流水：文件不存在 → []（这张图还没聊过）；坏 JSON/IO 失败 → warn + []
 *  （侧功能降级，不阻塞导图打开）。坏文件被读成 [] 后，下次 appendTurn 整写覆盖——
 *  文件本已不可用，且原子写保证正常路径不会写坏，只可能是外部篡改 */
export async function readChatHistory(fs: FsAdapter, mdPath: string): Promise<PersistedChatMessage[]> {
  const p = chatHistoryPathOf(mdPath)
  try {
    if (!(await fs.exists(p))) return []
    return parseChatMessages(JSON.parse(await fs.readTextFile(p))?.messages)
  } catch (e) {
    console.warn('读取 AI 对话历史失败（按无历史处理）', e)
    return []
  }
}

/** 回合收尾追加：过滤出本回合 user/assistant（空文本且无卡片的半截占位不入档——中止于
 *  首字前的占位；零文本但有操作卡片的保留：卡片是已发生引擎编辑的 honest 记录），
 *  read → 合并 → 原子整写。过滤后为空（纯错误回合）不写盘 */
export async function appendTurn(fs: FsAdapter, mdPath: string, turnMsgs: ChatMessage[]): Promise<void> {
  const persisted = turnMsgs
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
      (m.role === 'user' || m.role === 'assistant') && (m.text !== '' || (m.cards?.length ?? 0) > 0))
    .map((m): PersistedChatMessage => {
      const base: PersistedChatMessage = { role: m.role, text: m.text }
      if (m.cards !== undefined && m.cards.length > 0) base.cards = m.cards
      return base
    })
  if (persisted.length === 0) return
  const messages = [...(await readChatHistory(fs, mdPath)), ...persisted]
  await fs.writeTextFileAtomic(chatHistoryPathOf(mdPath), JSON.stringify({ version: 1, messages }, null, 2))
}

/** 回传窗口字符预算（≈1.5 万 token）：加载长历史/长会话不会无限爆上下文。
 *  截断只影响回传，UI 展示与持久化文件仍是全量 */
export const HISTORY_CHAR_BUDGET = 24000

/** 尾部窗口：从最新往回攒，加下一条会超预算即停；至少保一条（单条超预算也送——
 *  用户当下的输入就是想接着它聊，不能送空上下文）；发生截断时窗口首条若为
 *  assistant 则丢弃（窗口从 user 起，不悬空半轮） */
export function windowedHistory(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const flat = messages.filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
    m.text !== '' && (m.role === 'user' || (m.role === 'assistant' && m.rendered === true)))
  const picked: (ChatMessage & { role: 'user' | 'assistant' })[] = []
  let used = 0
  for (let i = flat.length - 1; i >= 0; i--) {
    const m = flat[i]!
    if (picked.length > 0 && used + m.text.length > HISTORY_CHAR_BUDGET) break
    picked.unshift(m)
    used += m.text.length
  }
  if (picked.length < flat.length && picked[0]?.role === 'assistant') picked.shift()
  return picked.map((m) => ({ role: m.role, content: m.text }))
}
