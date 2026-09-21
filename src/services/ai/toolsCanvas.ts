// src/services/ai/toolsCanvas.ts —— 画布域工具(spec §1/§3):正文/图标/标签/折叠/连线/布局。
// 表驱动同 tools.ts:一工具一 handler,失败回文本 AI 自纠。写工具渲染树寻址,收起分支
// miss 显式拒绝并提示先 set_node_expand(withAiCall 只包同步调用,execOnRenderNode 异步
// 重试链吃不到锁窗口——AI 有展开工具,多步自纠闭环)。
import { CURATED_ICONS } from '../../editor/zenIcons'
import { disambiguatedTarget } from '../../editor/linkBridge'
import { registryToLinks } from '../../editor/linkRegistry'
import type { ToolCtx, ToolCallResult, AiToolEnv } from './tools'
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
  {
    type: 'function',
    function: {
      name: 'set_node_expand',
      description: '展开或折叠指定节点的子树(只改显示,内容保留)。',
      parameters: {
        type: 'object',
        properties: {
          uid: { type: 'string' },
          expanded: { type: 'boolean', description: 'true 展开 / false 折叠' },
        },
        required: ['uid', 'expanded'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'expand_all', description: '展开整图全部节点。', parameters: { type: 'object', properties: {}, required: [] } },
  },
  {
    type: 'function',
    function: {
      name: 'collapse_to_level',
      description: '整图展开到指定层级(更深层收起)。整理大图常用,如收两层 level=2。',
      parameters: {
        type: 'object',
        properties: { level: { type: 'number', description: '展开到的层级,≥1 的整数' } },
        required: ['level'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_link',
      description: '在两节点间添加关联线(曲线连接,表达非父子关系)。',
      parameters: {
        type: 'object',
        properties: { fromUid: { type: 'string' }, toUid: { type: 'string' } },
        required: ['fromUid', 'toUid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_link',
      description: '删除两节点间的关联线。',
      parameters: {
        type: 'object',
        properties: { fromUid: { type: 'string' }, toUid: { type: 'string' } },
        required: ['fromUid', 'toUid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_layout',
      description: '切换整图布局:mindmap(右向)/ logic(左右发散)/ org(向下组织)/ timeline(时间轴)/ fishbone(鱼骨)。',
      parameters: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['mindmap', 'logic', 'org', 'timeline', 'fishbone'] } },
        required: ['kind'],
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

const handleSetNodeExpand = ({ mm, renderer, uidOf, boolOf, withAiCallFn }: ToolCtx): ToolCallResult => {
  const uid = uidOf('uid')
  const node = findNode(renderer, uid)
  if (!node) return { ok: false, detail: `节点不存在:[${uid}]` }
  withAiCallFn(() => mm.execCommand('SET_NODE_EXPAND', node, boolOf('expanded')))
  return { ok: true, detail: boolOf('expanded') ? '已展开' : '已折叠' }
}

const handleExpandAll = ({ mm, withAiCallFn }: ToolCtx): ToolCallResult => {
  withAiCallFn(() => mm.execCommand('EXPAND_ALL'))
  return { ok: true, detail: '已全部展开' }
}

const handleCollapseToLevel = ({ mm, num, withAiCallFn }: ToolCtx): ToolCallResult => {
  const raw = num('level')
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1)
    return { ok: false, detail: 'level 须为 ≥1 的整数' }
  withAiCallFn(() => mm.execCommand('UNEXPAND_TO_LEVEL', raw))
  return { ok: true, detail: `已展开到第 ${raw} 层` }
}

/** 注册表写 → 引擎 targets 同步(rebuildLinks)→ 置_dirty 走保存链(md 落 [[..]])。
 *  rebuildLinks 同步写引擎现态,保存链 harvestRegistry 收割现态——v0.7.0 删线复活防线继承 */
function commitRegistry(mm: ToolCtx['mm'], env: AiToolEnv): void {
  const plain = mm.getData()
  if (plain) mm.rebuildLinks?.(registryToLinks(plain, env.registry))
  env.onDataChanged()
}

/** 解析 toUid 节点的消歧 marker(linkBridge 同规则:名称唯一裸名,否则路径/#n) */
function markerOf(mm: ToolCtx['mm'], to: unknown): string | null {
  const text = (to as { getData?(k: string): unknown } | null | undefined)?.getData?.('text')
  if (typeof text !== 'string' || text === '') return null
  return disambiguatedTarget(mm, to as Parameters<typeof disambiguatedTarget>[1], text)
}

const handleAddLink = ({ mm, renderer, uidOf, env }: ToolCtx): ToolCallResult => {
  if (!env) return { ok: false, detail: '连线通道未就绪' }
  const fromUid = uidOf('fromUid')
  const toUid = uidOf('toUid')
  const from = findNode(renderer, fromUid)
  const to = findNode(renderer, toUid)
  if (!from || !to) return { ok: false, detail: `节点不存在:[${!from ? fromUid : toUid}]` }
  // 自环按 uid 判等(同 uid 即自环;不依赖引擎实例稳定性)
  if (fromUid === toUid) return { ok: false, detail: '不能连接自身' }
  const marker = markerOf(mm, to)
  if (marker === null) return { ok: false, detail: '目标节点无文本,无法建线' }
  const list = env.registry.byUid.get(fromUid) ?? []
  if (list.includes(marker)) return { ok: false, detail: '连线已存在' }
  env.registry.byUid.set(fromUid, [...list, marker])
  commitRegistry(mm, env)
  return { ok: true, detail: '连线已添加' }
}

const handleRemoveLink = ({ mm, renderer, uidOf, env }: ToolCtx): ToolCallResult => {
  if (!env) return { ok: false, detail: '连线通道未就绪' }
  const fromUid = uidOf('fromUid')
  const toUid = uidOf('toUid')
  const from = findNode(renderer, fromUid)
  const to = findNode(renderer, toUid)
  if (!from || !to) return { ok: false, detail: `节点不存在:[${!from ? fromUid : toUid}]` }
  const marker = markerOf(mm, to)
  if (marker === null) return { ok: false, detail: '目标节点无文本' }
  const list = env.registry.byUid.get(fromUid)
  if (!list || !list.includes(marker)) return { ok: false, detail: '连线不存在(可用 get_mindmap 查看现有连线)' }
  const next = list.filter((m) => m !== marker)
  if (next.length === 0) env.registry.byUid.delete(fromUid)
  else env.registry.byUid.set(fromUid, next)
  commitRegistry(mm, env)
  return { ok: true, detail: '连线已删除' }
}

/** 布局五值(layoutMap.LayoutKind 同集);走宿主组合通道(引擎重排+React 态+sidecar),
 *  不走命令层不置脏——与手工切换口径一致 */
const LAYOUT_KINDS = ['mindmap', 'logic', 'org', 'timeline', 'fishbone'] as const

const handleSetLayout = ({ strOf, env }: ToolCtx): ToolCallResult => {
  if (!env) return { ok: false, detail: '布局通道未就绪' }
  const kind = strOf('kind')
  if (!(LAYOUT_KINDS as readonly string[]).includes(kind))
    return { ok: false, detail: `非法布局:${kind}(可用:${LAYOUT_KINDS.join('/')})` }
  env.setLayout(kind as (typeof LAYOUT_KINDS)[number])
  return { ok: true, detail: `布局已切换为 ${kind}` }
}

export const CANVAS_HANDLERS: Record<string, (ctx: ToolCtx) => ToolCallResult> = {
  get_node_detail: handleGetNodeDetail,
  set_node_body: handleSetNodeBody,
  set_node_icon: handleSetNodeIcon,
  set_node_tags: handleSetNodeTags,
  set_node_expand: handleSetNodeExpand,
  expand_all: handleExpandAll,
  collapse_to_level: handleCollapseToLevel,
  add_link: handleAddLink,
  remove_link: handleRemoveLink,
  set_layout: handleSetLayout,
}
