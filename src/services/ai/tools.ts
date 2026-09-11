// src/services/ai/tools.ts —— AI 工具白名单与执行器（spec §3）：全部 uid 寻址、显式节点
// 参数（不动 activeNode）、命令走 execCommand 单一入口（共享 sanitize/撤销栈，withAiCall
// 持锁 token）。工具失败不抛异常——错误文本回传 AI 自纠（agent 标准容错）。
import type { EngineNode, MindMapHandle } from '../../types/engine'
import { treeToUidOutline } from './prompt'

export interface ToolCallResult {
  ok: boolean
  /** 供对话流卡片与 AI 理解的中文简述 */
  detail: string
  /** add_node 成功时的新节点 uid */
  uid?: string
}

/** 节点文本清洗：剥 \r（Word 粘贴毒节点教训，multiline.ts 同口径），压平换行 */
function sanitizeText(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').replace(/\s+\n/g, '\n').trim() : ''
}

/** OpenAI function 工具 schema（前端组装 body 用，Rust 不懂协议） */
export const AI_TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_mindmap',
      description: '重新读取当前导图全文（uid 缩进树格式）。多步编辑后上下文过期时调用。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_node',
      description: '在指定节点下新增一个子节点。',
      parameters: {
        type: 'object',
        properties: {
          parentUid: { type: 'string', description: '父节点 uid' },
          text: { type: 'string', description: '新节点文本' },
        },
        required: ['parentUid', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_node_text',
      description: '改写指定节点的文本。',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          text: { type: 'string', description: '新文本' },
        },
        required: ['uid', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_node',
      description: '删除指定节点及其整个子树。不可逆代价高，仅在明确必要时使用。',
      parameters: {
        type: 'object',
        properties: { uid: { type: 'string' } },
        required: ['uid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_node',
      description: '把节点（含子树）移动为另一节点的最后一个子节点。',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          newParentUid: { type: 'string' },
        },
        required: ['uid', 'newParentUid'],
      },
    },
  },
] as const

/** 引擎节点实例上取子数据树（引擎 MindMapNode.nodeData，仓库类型未声明故窄化 cast） */
type WithNodeData = { nodeData?: { children?: EngineNode[] } }

function findNode(mm: NonNullable<MindMapHandle['renderer']>, uid: string): unknown {
  return mm.findNodeByUid(uid)
}

export function executeAiTool(
  mm: MindMapHandle | null,
  name: string,
  argsRaw: unknown,
  withAiCallFn: <T>(fn: () => T) => T,
): ToolCallResult {
  if (!mm || !mm.renderer) return { ok: false, detail: '引擎未就绪' }
  const args = (typeof argsRaw === 'object' && argsRaw !== null ? argsRaw : {}) as Record<string, unknown>
  const uidOf = (k: string): string => (typeof args[k] === 'string' ? (args[k] as string) : '')
  const text = sanitizeText(args.text)

  if (name === 'get_mindmap') {
    const tree = mm.renderer.renderTree ?? null
    return { ok: true, detail: tree ? treeToUidOutline(tree).join('\n') : '（空图）' }
  }

  if (name === 'add_node') {
    const parentUid = uidOf('parentUid')
    const parent = findNode(mm.renderer, parentUid)
    if (!parent) return { ok: false, detail: `父节点不存在：[${parentUid}]` }
    if (!text) return { ok: false, detail: 'text 不能为空' }
    withAiCallFn(() => mm.execCommand('INSERT_CHILD_NODE', false, [parent], { text }))
    // 引擎按 appointNodes 插到末尾：从父节点数据树尾取回新 uid（引擎插入时自动生成 uid）
    const children = (parent as WithNodeData).nodeData?.children ?? []
    const newUid = children[children.length - 1]?.data?.uid
    return typeof newUid === 'string'
      ? { ok: true, detail: `已新增「${text}」`, uid: newUid }
      : { ok: false, detail: '插入命令已执行但未取到新节点 uid，可调 get_mindmap 核对' }
  }

  if (name === 'update_node_text') {
    const node = findNode(mm.renderer, uidOf('uid'))
    if (!node) return { ok: false, detail: `节点不存在：[${uidOf('uid')}]` }
    if (!text) return { ok: false, detail: 'text 不能为空' }
    withAiCallFn(() => mm.execCommand('SET_NODE_TEXT', node, text))
    return { ok: true, detail: '文本已改' }
  }

  if (name === 'remove_node') {
    const node = findNode(mm.renderer, uidOf('uid'))
    if (!node) return { ok: false, detail: `节点不存在：[${uidOf('uid')}]` }
    withAiCallFn(() => mm.execCommand('REMOVE_NODE', [node]))
    return { ok: true, detail: '节点已删除' }
  }

  if (name === 'move_node') {
    const node = findNode(mm.renderer, uidOf('uid'))
    const to = findNode(mm.renderer, uidOf('newParentUid'))
    if (!node || !to) return { ok: false, detail: `节点不存在：[${!node ? uidOf('uid') : uidOf('newParentUid')}]` }
    if (node === to) return { ok: false, detail: '不能移动到自身' }
    withAiCallFn(() => mm.execCommand('MOVE_NODE_TO', node, to))
    return { ok: true, detail: '节点已移动' }
  }

  return { ok: false, detail: `未知工具：${name}` }
}
