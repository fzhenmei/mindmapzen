// src/services/ai/tools.ts —— AI 工具白名单与执行器（spec §3）：全部 uid 寻址、显式节点
// 参数（不动 activeNode）、命令走 execCommand 单一入口（共享 sanitize/撤销栈，withAiCall
// 持锁 token）。工具失败不抛异常——错误文本回传 AI 自纠（agent 标准容错）。
// v1.1 表驱动：一工具一 handler（executeAiTurn 时代 if 链认知复杂度超 Sonar 阈值）。
import type { EngineNode, MindMapHandle } from '../../types/engine'
import { treeToUidOutline } from './prompt'

export interface ToolCallResult {
  ok: boolean
  /** 供对话流卡片与 AI 理解的中文简述 */
  detail: string
  /** add_node 成功时的新节点 uid */
  uid?: string
}

/** 节点文本清洗：剥 \r（Word 粘贴毒节点教训，multiline.ts 同口径），压平换行。
 *  零正则量词实现（S8786 只认单量词，\s+\n 的类与 \n 交集回溯、\r\n? 可选量词均报）：
 *  `\s+\n` 全局替换 ⟺ 删空行/纯空白行 + 每行 trimEnd（split/filter 方案逐行等价） */
function sanitizeText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim()
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
  {
    type: 'function',
    function: {
      name: 'up_node',
      description: '同级内上移一位（兄弟排序微调；MOVE_NODE_TO 只能追加末尾，精细排序靠本组工具）。',
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
      name: 'down_node',
      description: '同级内下移一位（兄弟排序微调）。',
      parameters: {
        type: 'object',
        properties: { uid: { type: 'string' } },
        required: ['uid'],
      },
    },
  },
] as const

/** 引擎节点实例上取子数据树（引擎 MindMapNode.nodeData，仓库类型未声明故窄化 cast） */
type WithNodeData = { nodeData?: { children?: EngineNode[] } }

function findNode(mm: NonNullable<MindMapHandle['renderer']>, uid: string): unknown {
  return mm.findNodeByUid(uid)
}

/** dispatch 备好的公共参数（各 handler 按需窄用） */
interface ToolCtx {
  mm: MindMapHandle
  renderer: NonNullable<MindMapHandle['renderer']>
  text: string
  uidOf(k: string): string
  withAiCallFn: <T>(fn: () => T) => T
}

const handleGetMindmap = ({ renderer }: ToolCtx): ToolCallResult => {
  const tree = renderer.renderTree ?? null
  return { ok: true, detail: tree ? treeToUidOutline(tree).join('\n') : '（空图）' }
}

const handleAddNode = ({ mm, renderer, uidOf, text, withAiCallFn }: ToolCtx): ToolCallResult => {
  const parentUid = uidOf('parentUid')
  const parent = findNode(renderer, parentUid)
  if (!parent) return { ok: false, detail: `父节点不存在：[${parentUid}]` }
  if (!text) return { ok: false, detail: 'text 不能为空' }
  withAiCallFn(() => mm.execCommand('INSERT_CHILD_NODE', false, [parent], { text }))
  // 引擎按 appointNodes 插到末尾：从父节点数据树尾取回新 uid（引擎插入时自动生成 uid）
  const children = (parent as WithNodeData).nodeData?.children ?? []
  const newUid = children.at(-1)?.data?.uid
  return typeof newUid === 'string'
    ? { ok: true, detail: `已新增「${text}」`, uid: newUid }
    : { ok: false, detail: '插入命令已执行但未取到新节点 uid，可调 get_mindmap 核对' }
}

const handleUpdateNodeText = ({ mm, renderer, uidOf, text, withAiCallFn }: ToolCtx): ToolCallResult => {
  const node = findNode(renderer, uidOf('uid'))
  if (!node) return { ok: false, detail: `节点不存在：[${uidOf('uid')}]` }
  if (!text) return { ok: false, detail: 'text 不能为空' }
  withAiCallFn(() => mm.execCommand('SET_NODE_TEXT', node, text))
  return { ok: true, detail: '文本已改' }
}

const handleRemoveNode = ({ mm, renderer, uidOf, withAiCallFn }: ToolCtx): ToolCallResult => {
  const node = findNode(renderer, uidOf('uid'))
  if (!node) return { ok: false, detail: `节点不存在：[${uidOf('uid')}]` }
  withAiCallFn(() => mm.execCommand('REMOVE_NODE', [node]))
  return { ok: true, detail: '节点已删除' }
}

const handleMoveNode = ({ mm, renderer, uidOf, withAiCallFn }: ToolCtx): ToolCallResult => {
  const node = findNode(renderer, uidOf('uid'))
  const to = findNode(renderer, uidOf('newParentUid'))
  if (!node || !to) return { ok: false, detail: `节点不存在：[${!node ? uidOf('uid') : uidOf('newParentUid')}]` }
  if (node === to) return { ok: false, detail: '不能移动到自身' }
  withAiCallFn(() => mm.execCommand('MOVE_NODE_TO', node, to))
  return { ok: true, detail: '节点已移动' }
}

// 同级排序微调（v1.1）：引擎 UP_NODE/DOWN_NODE 支持 appointNode 显式传参（不回落
// activeNodeList），但首位/末位/根是静默 no-op——不显式拒绝会骗过 AI（以为成功），
// 故边界先查 parent.children 位置再派发
const handleOrderNode = ({ mm, renderer, uidOf, withAiCallFn, name }: ToolCtx & { name: string }): ToolCallResult => {
  const uid = uidOf('uid')
  const node = findNode(renderer, uid)
  if (!node) return { ok: false, detail: `节点不存在：[${uid}]` }
  const parent = (node as { parent?: { children?: unknown[] } | null }).parent
  if (!parent) return { ok: false, detail: '根节点不能移动' }
  const siblings = parent.children ?? []
  const idx = siblings.indexOf(node)
  if (idx === -1) return { ok: false, detail: '未找到同级位置，可调 get_mindmap 核对' }
  const up = name === 'up_node'
  if (up && idx === 0) return { ok: false, detail: '已是同级第一位，不能再上移' }
  if (!up && idx === siblings.length - 1) return { ok: false, detail: '已是同级最后一位，不能再下移' }
  withAiCallFn(() => mm.execCommand(up ? 'UP_NODE' : 'DOWN_NODE', node))
  return { ok: true, detail: up ? '节点已上移一位' : '节点已下移一位' }
}

/** 一工具一 handler；up/down 共用 handleOrderNode（方向经闭包注入） */
const HANDLERS: Record<string, (ctx: ToolCtx) => ToolCallResult> = {
  get_mindmap: handleGetMindmap,
  add_node: handleAddNode,
  update_node_text: handleUpdateNodeText,
  remove_node: handleRemoveNode,
  move_node: handleMoveNode,
  up_node: (ctx) => handleOrderNode({ ...ctx, name: 'up_node' }),
  down_node: (ctx) => handleOrderNode({ ...ctx, name: 'down_node' }),
}

export function executeAiTool(
  mm: MindMapHandle | null,
  name: string,
  argsRaw: unknown,
  withAiCallFn: <T>(fn: () => T) => T,
): ToolCallResult {
  if (!mm?.renderer) return { ok: false, detail: '引擎未就绪' }
  const handler = HANDLERS[name]
  if (!handler) return { ok: false, detail: `未知工具：${name}` }
  const args = (typeof argsRaw === 'object' && argsRaw !== null ? argsRaw : {}) as Record<string, unknown>
  return handler({
    mm,
    renderer: mm.renderer,
    text: sanitizeText(args.text),
    uidOf: (k) => (typeof args[k] === 'string' ? (args[k] as string) : ''),
    withAiCallFn,
  })
}
