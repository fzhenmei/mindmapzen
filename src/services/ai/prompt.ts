// src/services/ai/prompt.ts —— AI 视角的导图序列化（spec §3.1）：uid 缩进树代替 md 原文
// （备注/图标标记是噪音），AI 编辑引用 uid 无重名歧义、token 便宜。
import type { EngineNode } from '../../types/engine'

/** 节点文本压平（换行/连续空白 → 单空格）：树行是单行语义，原始换行会破坏缩进结构 */
function flatText(node: EngineNode): string {
  return typeof node.data?.text === 'string' ? node.data.text.replace(/\s+/g, ' ').trim() : ''
}

function nodeUid(node: EngineNode): string {
  return typeof node.data?.uid === 'string' ? node.data.uid : '?'
}

/** 快照轻量标记(spec §2):有则标无则省。图标剥 zen_ 前缀、滤 zen_status- 徽章
 *  (内部保留名,useIconPicker 同口径);正文首行截 30 字(AI 靠摘要判断要不要
 *  get_node_detail 读全文);连线尾标直读 data.associativeLineTargets(uid 形态,
 *  rebuildEngineLinks 写入口——与 add_link/remove_link 参数寻址对齐,不经注册表) */
const BODY_SUMMARY_LEN = 30

function nodeMarkers(node: EngineNode): string {
  const d = node.data as { tag?: unknown; icon?: unknown; body?: unknown; associativeLineTargets?: unknown }
  let s = ''
  if (Array.isArray(d.tag)) {
    const tags = d.tag.filter((t): t is string => typeof t === 'string' && t !== '')
    if (tags.length > 0) s += ` 🏷${tags.join('/')}`
  }
  if (Array.isArray(d.icon)) {
    const icons = d.icon
      .filter((i): i is string => typeof i === 'string' && i.startsWith('zen_') && !i.startsWith('zen_status-'))
      .map((i) => i.slice(4))
    if (icons.length > 0) s += ` ☰${icons.join(',')}`
  }
  if (typeof d.body === 'string' && d.body !== '') {
    const firstLine = d.body.split('\n').find((l) => l.trim() !== '') ?? ''
    s += ` 📝${firstLine.slice(0, BODY_SUMMARY_LEN)}`
  }
  if (Array.isArray(d.associativeLineTargets)) {
    const targets = d.associativeLineTargets.filter((t): t is string => typeof t === 'string' && t !== '')
    if (targets.length > 0) {
      // uid 列表先拼好再入外层模板,避免模板字面量嵌套(Sonar S4624)
      const uidList = targets.map((t) => `[${t}]`).join('')
      s += ` →${uidList}`
    }
  }
  return s
}

/** 数据树 → uid 缩进树行数组（含收起隐藏子树——renderTree 全量语义由调用方保证） */
export function treeToUidOutline(node: EngineNode, depth = 0): string[] {
  const line = `${'  '.repeat(depth)}- [${nodeUid(node)}] ${flatText(node)}${nodeMarkers(node)}`
  return [line, ...(node.children ?? []).flatMap((c) => treeToUidOutline(c, depth + 1))]
}

/** 选中节点提示行（用户消息后缀，支持"这个节点"指代）；null 无选中 */
export function selectionLine(node: { uid: string; text: string } | null): string | null {
  if (!node) return null
  return `[${node.uid}] ${node.text.replace(/\s+/g, ' ').trim()}`
}

/** system prompt：角色 + 工具纪律 + 当前树快照 */
export function buildSystemPrompt(tree: EngineNode | null): string {
  const outline = tree ? treeToUidOutline(tree).join('\n') : '（空）'
  return [
    '你是思维导图编辑助手，与用户共同编写当前导图。',
    '当前导图（每行 "- [uid] 文本"，uid 是节点的稳定标识）：',
    outline,
    '',
    '工作纪律:',
    '1. 修改导图只能用提供的工具,用 uid 定位节点;节点行上的 🏷标签 / ☰图标 / 📝正文摘要 / →连线 标记是现状,改对应内容前先看清;',
    '2. 大改动分多步小改,每步等工具结果确认成功再继续;工具失败会返回错误文本,按提示自纠;节点在收起分支中操作失败时,先 set_node_expand 展开;',
    '3. 需要重新查看改后的全图时调 get_mindmap;改写正文前先 get_node_detail 读现有全文;',
    '4. 文本保持简洁(节点是关键词,不是段落);不改动与用户诉求无关的节点;',
    '5. 折叠与布局是视图操作(不落盘、可随时再切);内容修改(文本/正文/图标/标签/连线)会保存进文件。',
  ].join('\n')
}
