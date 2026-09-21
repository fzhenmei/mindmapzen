// src/services/ai/toolsCanvas.ts —— 画布域工具(spec §1/§3):正文/图标/标签/折叠/连线/布局。
// 表驱动同 tools.ts:一工具一 handler,失败回文本 AI 自纠。写工具渲染树寻址,收起分支
// miss 显式拒绝并提示先 set_node_expand(withAiCall 只包同步调用,execOnRenderNode 异步
// 重试链吃不到锁窗口——AI 有展开工具,多步自纠闭环)。
import { CURATED_ICONS } from '../../editor/zenIcons'
import type { ToolCtx, ToolCallResult } from './tools'
import type { EngineNode } from '../../types/engine'

/** 图标白名单 kebab 名(schema enum 与 handler 校验同源;导出供后续任务 schema 组装消费) */
export const ICON_NAMES = Object.keys(CURATED_ICONS)

/** 渲染树 miss 的统一拒绝文案:提示 AI 先展开(收起分支里的节点不在渲染树) */
const COLLAPSED_HINT = '(节点可能位于收起分支,先调 set_node_expand 展开其所在分支后重试)'

export const AI_CANVAS_TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_node_detail',
      description: '读取指定节点的正文全文、图标、标签(快照只带首行摘要,改写前先读全文)。',
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
      name: 'set_node_body',
      description: '改写指定节点的正文(markdown 长文,悬停可预览)。改前建议先 get_node_detail 读现有内容。',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          text: { type: 'string', description: '新正文全文;空串 = 清空' },
        },
        required: ['uid', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_node_icon',
      description: '整组设置指定节点的图标(覆写现有用户图标)。names 只能取白名单 kebab 名。',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          names: { type: 'array', items: { type: 'string', enum: ICON_NAMES }, description: '图标 kebab 名整组;空数组 = 清空' },
        },
        required: ['uid', 'names'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_node_tags',
      description: '整组设置指定节点的标签(覆写现有标签,自由文本,最多 10 个)。空数组 = 清空。',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['uid', 'tags'],
      },
    },
  },
] as const

/** 数据树全量寻址(读专用:收起分支可读;renderTree 即 EngineNode 形状) */
function findDataNode(root: EngineNode | null | undefined, uid: string): EngineNode | null {
  if (!root) return null
  if (root.data?.uid === uid) return root
  for (const child of root.children ?? []) {
    const hit = findDataNode(child, uid)
    if (hit) return hit
  }
  return null
}

/** 渲染树寻址(写专用,tools.ts 同款一行):收起分支里的节点不在渲染树,miss 由调用方显式拒绝 */
function findNode(renderer: ToolCtx['renderer'], uid: string): unknown {
  return renderer.findNodeByUid(uid)
}

/** 从引擎节点 data 取用户图标 kebab 名(剥 zen_ 前缀滤徽章,prompt.ts 同口径) */
function dataIconNames(d: { icon?: unknown }): string[] {
  return Array.isArray(d.icon)
    ? d.icon
        .filter((i): i is string => typeof i === 'string' && i.startsWith('zen_') && !i.startsWith('zen_status-'))
        .map((i) => i.slice(4))
    : []
}

const handleGetNodeDetail = ({ renderer, uidOf }: ToolCtx): ToolCallResult => {
  const node = findDataNode(renderer.renderTree, uidOf('uid'))
  if (!node) return { ok: false, detail: `节点不存在：[${uidOf('uid')}]` }
  const d = node.data as { body?: unknown; tag?: unknown; icon?: unknown }
  const body = typeof d.body === 'string' ? d.body : ''
  const tags = Array.isArray(d.tag) ? d.tag.filter((t): t is string => typeof t === 'string') : []
  return { ok: true, detail: JSON.stringify({ body, icons: dataIconNames(d), tags }) }
}

const handleSetNodeBody = ({ mm, renderer, uidOf, strOf, withAiCallFn }: ToolCtx): ToolCallResult => {
  const uid = uidOf('uid')
  const node = findNode(renderer, uid)
  if (!node) return { ok: false, detail: `节点不存在:[${uid}]${COLLAPSED_HINT}` }
  // 正文清洗只剥 \r(Word 毒节点教训,\r 进 serialize 断言抛错):markdown 段落空行/行尾空白
  // 有语义须保留,不走 ToolCtx.text 的 sanitizeText(那是节点单行文本口径:删空行+逐行 trimEnd)
  const text = strOf('text').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const next = text === '' ? undefined : text
  withAiCallFn(() => mm.execCommand('SET_NODE_DATA', node, { body: next, note: next }))
  // 角标/悬停即时增删(useBodyDialog 同款补重渲:裸命令不重渲染)
  mm.renderer?.reRenderNodeCheckChange?.(node)
  return { ok: true, detail: text === '' ? '正文已清空' : '正文已写入' }
}

const handleSetNodeIcon = ({ mm, renderer, uidOf, list, withAiCallFn }: ToolCtx): ToolCallResult => {
  const uid = uidOf('uid')
  const node = findNode(renderer, uid)
  if (!node) return { ok: false, detail: `节点不存在:[${uid}]${COLLAPSED_HINT}` }
  const names = list('names')
  const bad = names.filter((n) => !ICON_NAMES.includes(n))
  if (bad.length > 0) return { ok: false, detail: `非法图标名:${bad.join(', ')}(仅可用白名单:${ICON_NAMES.length} 个 kebab 名)` }
  // 徽章互保(useIconPicker 同口径):覆写用户图标前保留 zen_status- 状态徽章
  const cur = (node as { getData?(k: string): unknown }).getData?.('icon')
  const badges = Array.isArray(cur) ? cur.filter((i): i is string => typeof i === 'string' && i.startsWith('zen_status-')) : []
  withAiCallFn(() => mm.execCommandIcon?.(uid, [...badges, ...names.map((n) => `zen_${n}`)]))
  return { ok: true, detail: names.length === 0 ? '图标已清空' : `图标已设:${names.join(',')}` }
}

const handleSetNodeTags = ({ mm, renderer, uidOf, list, withAiCallFn }: ToolCtx): ToolCallResult => {
  const uid = uidOf('uid')
  const node = findNode(renderer, uid)
  if (!node) return { ok: false, detail: `节点不存在:[${uid}]${COLLAPSED_HINT}` }
  const tags = list('tags')
  if (tags.length > 10) return { ok: false, detail: `标签最多 10 个(maxTag 上限,与手动选择器一致)` }
  withAiCallFn(() => mm.execCommandTag?.(uid, tags))
  return { ok: true, detail: tags.length === 0 ? '标签已清空' : `标签已设:${tags.join('/')}` }
}

export const CANVAS_HANDLERS: Record<string, (ctx: ToolCtx) => ToolCallResult> = {
  get_node_detail: handleGetNodeDetail,
  set_node_body: handleSetNodeBody,
  set_node_icon: handleSetNodeIcon,
  set_node_tags: handleSetNodeTags,
}
