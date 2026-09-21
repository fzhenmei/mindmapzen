// src/services/ai/toolsCanvas.ts —— 画布域工具(spec §1/§3):正文/图标/标签/折叠/连线/布局。
// 表驱动同 tools.ts:一工具一 handler,失败回文本 AI 自纠。写工具渲染树寻址,收起分支
// miss 显式拒绝并提示先 set_node_expand(withAiCall 只包同步调用,execOnRenderNode 异步
// 重试链吃不到锁窗口——AI 有展开工具,多步自纠闭环)。
import { CURATED_ICONS } from '../../editor/zenIcons'
import type { ToolCtx, ToolCallResult } from './tools'
import type { EngineNode } from '../../types/engine'

/** 图标白名单 kebab 名(schema enum 与 handler 校验同源;导出供后续任务 schema 组装消费) */
export const ICON_NAMES = Object.keys(CURATED_ICONS)

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

export const CANVAS_HANDLERS: Record<string, (ctx: ToolCtx) => ToolCallResult> = {
  get_node_detail: handleGetNodeDetail,
}
