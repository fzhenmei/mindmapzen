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

/** 数据树 → uid 缩进树行数组（含收起隐藏子树——renderTree 全量语义由调用方保证） */
export function treeToUidOutline(node: EngineNode, depth = 0): string[] {
  const line = `${'  '.repeat(depth)}- [${nodeUid(node)}] ${flatText(node)}`
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
    '工作纪律：',
    '1. 修改导图只能用提供的工具（add_node / update_node_text / remove_node / move_node / up_node / down_node），用 uid 定位节点；',
    '2. 大改动分多步小改，每步等工具结果确认成功再继续；工具失败会返回错误文本，按提示自纠；',
    '3. 需要重新查看改后的全图时调 get_mindmap；',
    '4. 文本保持简洁（节点是关键词，不是段落）；不改动与用户诉求无关的节点。',
  ].join('\n')
}
