import { useEffect, useRef } from 'react'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
// 关联线几何工具（M5d Task 5 弯曲记忆）：端点定位与默认控制点算式，与引擎 addLine 同源（见下方 defaultControlOffsets）
import {
  computeNodePoints,
  computeCubicBezierPathPoints,
} from 'simple-mind-map/src/plugins/associativeLine/associativeLineUtils.js'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { ResolvedLink } from '../services/links'
import { stripMarkers } from '../services/linkMarkers'
import {
  normalizeEngineOffsets,
  resolveLinkOffsets,
  type ControlPointOffset,
  type LinkAdjust,
} from '../services/linkAdjust'
import { harvestRegistry, registryToLinks, stripTreeTexts, type LinkRegistry } from './linkRegistry'
import { handleEngineKeyDown } from './engineKeyboard'
import { registerZenThemes } from './engineThemes'
import { bridgeLinkToRegistry } from './linkBridge'
import { seedUndoBaseline } from './undoSeed'

// 节点拖拽插件：拖到节点上=成为其子节点，拖到两节点之间=调整同级顺序（spec P0"拖拽节点改变层级与顺序"）
// eslint-disable-next-line react-hooks/rules-of-hooks -- 引擎静态注册 API，非 React Hook（use 前缀误报）
MindMap.usePlugin(Drag)

// 节点连线插件（M5b Task 3）：[[..]] 双链由 rebuildEngineLinks 直写 targets 数据后驱动重绘
// eslint-disable-next-line react-hooks/rules-of-hooks -- 引擎静态注册 API，非 React Hook（use 前缀误报，同上）
MindMap.usePlugin(AssociativeLine)

// 导出插件（M5b Task 5）：实例构造时挂 mindMap.doExport（instanceName，engine-api.md「M5b 核验 (b)」）；
// png()/svg() 返回 base64 data URL 字符串，由 services/exportImage 解码写盘/入剪贴板
// eslint-disable-next-line react-hooks/rules-of-hooks -- 引擎静态注册 API，非 React Hook（use 前缀误报，同上）
MindMap.usePlugin(Export)

// 主题注册必须先于任何实例构造：构造 opt.theme 未注册时引擎静默回退默认主题
// （index.js:370-373 theme[opt.theme] || theme.default，见 docs/notes/engine-api.md「M4 核验」(11)）
registerZenThemes()

// 改变折叠态的引擎命令（与引擎 Render.js 注册的四个展开类命令对齐）：命令完成即改变需持久化的数据
const EXPAND_COMMANDS = new Set(['SET_NODE_EXPAND', 'EXPAND_ALL', 'UNEXPAND_ALL', 'UNEXPAND_TO_LEVEL'])

/** 渲染树节点实例的最小结构（MindMapNode）：getData() 无参返回 nodeData.data 活引用（引擎核验 M5b Task 3）；
 *  left/top/width/height 为布局后的画布内容坐标（M5d Task 5 弯曲记忆默认差值计算用） */
interface EngineNodeInstance {
  getData(key?: string): unknown
  children?: EngineNodeInstance[]
  left?: number
  top?: number
  width?: number
  height?: number
}

/** 关联线宿主数据键全集（AssociativeLine 写/读；重建时全清——连线完全由 [[..]] 派生） */
const ASSOCIATIVE_KEYS = [
  'associativeLineTargets',
  'associativeLinePoint',
  'associativeLineTargetControlOffsets',
  'associativeLineText',
  'associativeLineStyle',
] as const

/** 按 [[名称]] 双链重建关联线：清空全树连线数据后按 toNode uid 直写 targets，再驱动渲染器重绘。
 *  刻意不走 ADD_ASSOCIATIVE_LINE/SET_NODE_DATA 命令：命令会进历史并触发 data_change → 宿主置脏 →
 *  自动保存循环；而连线是 md 派生数据（engineTreeToZen 只读 text/note/expand，不落盘），无需入历史。
 *  渲染器数据驱动：node_tree_render_end/data_change 时插件按 data.associativeLineTargets 自动重绘，
 *  故后续文本编辑引起的重排无需再触发本函数。自环丢弃（引擎 UI completeCreateLine 同语义）。
 *  弯曲记忆（M5d Task 5）：可选 adjust（sidecar linkAdjust，打开恢复用）——写 targets 后逐节点按
 *  resolveLinkOffsets 回填控制点差值（引擎现存优先，保存链重建不回退用户刚拖的弯；失联回退 sidecar）。
 *  offsets 数组必须稠密（引擎拖控制点路径直读 offsets[targetIndex][1] 无判空，稀疏数组拖弯即崩，
 *  见 engine-api.md「M5d 核验 (d)」）：有落位时空洞按 addLine 同款算式补引擎默认差值；
 *  节点几何不可得（防御）则整节点放弃写 offsets（渲染仍按默认曲线画）。
 *  具名导出供 rebuildLinks.test 直测恢复胶水层（组件本体仍由 E2E 覆盖，不变）。 */
export function rebuildEngineLinks(mm: MindMapHandle, links: ResolvedLink[], adjust?: LinkAdjust): void {
  const run = (): void => {
    const root = mm.renderer?.root as EngineNodeInstance | null | undefined
    if (!root) return
    const byPath = new Map<string, EngineNodeInstance>()
    const pathByNode = new Map<EngineNodeInstance, string>()
    const nodeByUid = new Map<string, EngineNodeInstance>()
    const pathByUid = new Map<string, string>()
    // 清键前按 uid 留档既有差值：重建后按 uid 回填（索引顺序可能因增删线漂移，uid 才是稳定锚）
    const existingByUid = new Map<EngineNodeInstance, Map<string, [ControlPointOffset, ControlPointOffset]>>()
    const walk = (node: EngineNodeInstance, parentPath: string): void => {
      const text = node.getData('text')
      const path = parentPath === '' ? '/' + String(text) : parentPath + '/' + String(text)
      byPath.set(path, node)
      pathByNode.set(node, path)
      const uid = node.getData('uid')
      if (typeof uid === 'string') {
        nodeByUid.set(uid, node)
        pathByUid.set(uid, path)
      }
      const data = node.getData() as Record<string, unknown> | undefined
      if (data) {
        const oldTargets = data.associativeLineTargets
        const oldOffsets = data.associativeLineTargetControlOffsets
        if (Array.isArray(oldTargets) && Array.isArray(oldOffsets)) {
          const kept = new Map<string, [ControlPointOffset, ControlPointOffset]>()
          oldTargets.forEach((t, i) => {
            if (typeof t !== 'string') return
            const pair = normalizeEngineOffsets(oldOffsets[i])
            if (pair !== undefined) kept.set(t, pair)
          })
          if (kept.size > 0) existingByUid.set(node, kept)
        }
        for (const key of ASSOCIATIVE_KEYS) delete data[key]
      }
      for (const child of node.children ?? []) walk(child, path)
    }
    walk(root, '')
    const targets = new Map<EngineNodeInstance, string[]>()
    for (const { fromPath, toPath } of links) {
      const from = byPath.get(fromPath)
      const to = byPath.get(toPath)
      const uid = to?.getData('uid')
      if (!from || !to || from === to || typeof uid !== 'string') continue
      const list = targets.get(from) ?? []
      if (!list.includes(uid)) list.push(uid)
      targets.set(from, list)
    }
    targets.forEach((uids, from) => {
      const data = from.getData() as Record<string, unknown> | undefined
      if (!data) return
      data.associativeLineTargets = uids
      const pairs = resolveLinkOffsets(uids, pathByNode.get(from)!, pathByUid, existingByUid.get(from) ?? new Map(), adjust)
      if (!pairs.some((p) => p !== undefined)) return // 全线无弯曲：不写 offsets，渲染按默认曲线
      // 空洞补引擎默认差值（addLine 同款算式，AssociativeLine.js:609-632）：差值相对当前端点，
      // 与节点后续重排解耦（引擎保存差值正为此）；几何不可得时整节点放弃（宁缺勿稀疏）
      const dense: Array<[ControlPointOffset, ControlPointOffset]> = []
      for (let i = 0; i < uids.length; i++) {
        const pair = pairs[i]
        if (pair !== undefined) {
          dense[i] = pair
          continue
        }
        const to = nodeByUid.get(uids[i]!)
        const fallback = to ? defaultControlOffsets(from, to) : undefined
        if (fallback === undefined) return
        dense[i] = fallback
      }
      data.associativeLineTargetControlOffsets = dense
    })
    ;(mm as unknown as { associativeLine?: { renderAllLines(): void } }).associativeLine?.renderAllLines()
  }
  // 引擎构造后首帧渲染经 Render.render 的 setTimeout(0) 异步完成，root 未就绪时一次性挂监听等渲染结束
  if (mm.renderer?.root) run()
  else
    mm.on('node_tree_render_end', function onEnd() {
      mm.off('node_tree_render_end', onEnd)
      run()
    })
}

/** 引擎默认控制点差值（AssociativeLine.addLine 的建线算式复刻：computeNodePoints 定端点 +
 *  computeCubicBezierPathPoints 得默认控制点，差值 = 控制点 − 端点）；节点几何不可得返回 undefined */
function defaultControlOffsets(
  from: EngineNodeInstance,
  to: EngineNodeInstance,
): [ControlPointOffset, ControlPointOffset] | undefined {
  const [sp, ep] = computeNodePoints(from, to)
  const [c1, c2] = computeCubicBezierPathPoints(sp.x, sp.y, ep.x, ep.y)
  if ([sp.x, sp.y, ep.x, ep.y, c1.x, c1.y, c2.x, c2.y].some((n) => !Number.isFinite(n))) return undefined
  return [
    { x: c1.x - sp.x, y: c1.y - sp.y },
    { x: c2.x - ep.x, y: c2.y - ep.y },
  ]
}

/** 打开/保存后再净化（M5d Task 2 + v0.7.0 验收修复）：等首帧渲染后走渲染树——
 *  ①harvestRegistry 按引擎现态重建注册表（打开时引擎 targets 恒空＝纯文本标记建表；
 *  保存后收割含引擎 targets——删线修剪后的现态为权威，替换语义不残留陈旧条目）；
 *  ②data 本体直写 stripTreeTexts 剥离显示文本（同 rebuildEngineLinks 直写通道：
 *  不进命令层、无历史、无 data_change → 打开净化不置脏）；③逐节点按需重渲（文本变短重算尺寸）；
 *  ④按注册表重建连线（显示文本已剥离，连线数据源自此是注册表而非文本标记）。
 *  adjust（M5d Task 5）＝打开时 sidecar linkAdjust，随重建一并恢复用户拖过的弯曲；
 *  保存后入口（onSaved）不传 adjust——引擎现存差值即最新（rebuildEngineLinks 内按 uid 留档回填） */
function applyRegistryToEngine(mm: MindMapHandle, reg: LinkRegistry, adjust?: LinkAdjust): void {
  const run = (): void => {
    const root = mm.renderer?.root as EngineNodeInstance | null | undefined
    if (!root) return
    const changed: EngineNodeInstance[] = []
    // 活引用快照：plain 树的 data 即引擎节点 data 本体（getData() 无参返回活引用）
    const toPlain = (node: EngineNodeInstance): EngineNode => {
      const data = (node.getData() ?? { text: '' }) as EngineNode['data']
      if (typeof data.text === 'string' && stripMarkers(data.text) !== data.text) changed.push(node)
      return { data, children: (node.children ?? []).map(toPlain) }
    }
    const plain = toPlain(root)
    harvestRegistry(plain, reg)
    stripTreeTexts(plain)
    for (const node of changed) mm.renderer?.reRenderNodeCheckChange(node)
    rebuildEngineLinks(mm, registryToLinks(plain, reg), adjust)
    // 撤销基线种子（v1.1）：此刻是「文档打开且净化完成」的稳态——净化后现态入撤销栈，首条编辑才可
    // 撤销；栈非空即幂等跳过（保存链再净化路径不受扰）。机制与实证见 undoSeed.ts / engine-api.md
    seedUndoBaseline(mm)
  }
  // 同 rebuildEngineLinks：构造后首帧渲染经 setTimeout(0) 异步完成，未就绪时一次性挂监听
  if (mm.renderer?.root) run()
  else
    mm.on('node_tree_render_end', function onEnd() {
      mm.off('node_tree_render_end', onEnd)
      run()
    })
}

interface Props {
  tree: EngineNode
  /** 连线净化会话注册表（M5d Task 2）：稳定引用对象（EditorView 经 useLinkPurify 持有），
   *  打开建表、序列化注入、画线桥接共享同一份 */
  registry: LinkRegistry
  onReady: (mm: MindMapHandle) => void
  /** 引擎数据变化回调；data 为引擎随事件附带的整树快照（无载荷的调用视为必有变化，见下） */
  onDataChange: (data?: EngineNode) => void
  onActiveChange?: (uid: string | null) => void
  onEditorPaste?: (rawText: string) => void
  layout?: string
  /** 引擎主题名（zen-paper/zen-night，见 engineThemes.ts）；挂载期入构造 opt，运行中变更走 setTheme 不重挂载 */
  theme?: string
}

/** 引擎画布封装：挂载建实例、卸载销毁；父组件用 key={mdPath} 切换文档。
 *  本组件不做单元测试（引擎依赖真实 DOM 布局），由 E2E 与手工清单覆盖。 */
export default function MindMapCanvas({
  tree,
  registry,
  onReady,
  onDataChange,
  onActiveChange,
  onEditorPaste,
  layout,
  theme,
}: Readonly<Props>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<MindMapHandle | null>(null)
  // 始终持最新回调：挂载 effect 只订阅一次，避免闭包停留在首帧 props（Task 5 遗留加固）
  const cbRef = useRef({ onReady, onDataChange, onActiveChange, onEditorPaste, registry })
  cbRef.current = { onReady, onDataChange, onActiveChange, onEditorPaste, registry }

  useEffect(() => {
    const mm = new MindMap({
      el: containerRef.current!,
      data: tree,
      ...(layout ? { layout } : {}),
      ...(theme ? { theme } : {}),
      // 叶节点快捷建子 "+"（验收轮）：引擎原生 quickCreateChildBtn——激活叶节点显示、点击即插入子节点并进入
      // 编辑（INSERT_CHILD_NODE，MindMapNode.js:157/516 按 opt 门控；显式声明防未来默认值漂移）
      isShowCreateChildBtnIcon: true,
      // 撤销历史入栈节流窗（v1.1）：引擎默认 100ms 且窗口内调用**整体丢弃**（utils/index.js:281 纯尾随节流），
      // 实证会把文本提交的入史调用整个吞掉——撤销栈顶停在插入时默认文本，最后一条编辑无法按步撤销、
      // 重做落点也与用户所见漂移。窗口收到近零后每次命令变更即时入史（重复入史由 undoSeed 的
      // 瞬态键剥离+同值去重吸收；见 engine-api.md「v1.1 核验」）
      addHistoryTime: 1,
      // 连线注册表桥接（M5d Task 2）：completeCreateLine 在引擎 addLine 前读此 opt 钩子
      // （AssociativeLine.js:565-571），桥接改注册表后返回 true 阻断引擎落线（md 是唯一事实源，
      // 显示文本全程不动——保存链经 onDataChange 上报触发，序列化时句尾注入标记）。
      // 闭包在调用期（构造后）才解引用 mm；registry/onDataChange 经 cbRef 取调用期最新值
      beforeAssociativeLineConnection: (toNode: unknown) =>
        bridgeLinkToRegistry(
          mm,
          cbRef.current.registry,
          toNode,
          () => cbRef.current.onDataChange(), // 无载荷上报=必有变化：置脏 + 5s 自动保存链
        ),
    })
    mmRef.current = mm
    // data_change 附带整树快照透传（宿主据此判定「与已落盘一致」的同值事件，见 EditorView）；
    // 无载荷的调用（下方展开命令同步上报）视为必有变化。
    // v1.1：引擎 data_change 仅两处发源（Command.js:127 恒带载荷 / Render.js:752 backForward），
    // 撤销重做空栈无操作时 backForward 仍发 data_change(undefined)——无载荷即无变化，丢弃，
    // 否则空栈按 Ctrl+Z 会误置脏并触发一轮冗余自动保存（v1.1 核验，engine-api.md）
    const changed = (...args: unknown[]) => {
      if (args[0] === undefined) return
      cbRef.current.onDataChange(args[0] as EngineNode)
    }
    mm.on('data_change', changed)
    // 展开/收起即时上报（验收修复 4）：引擎 data_change 经 addHistory 尾随节流延迟发出（引擎默认
    // 100ms，本仓已设 1ms，见上方 addHistoryTime；同值不重发使展开折叠命令可能根本不触发事件），
    // 期间宿主 dirty 尚未置位——干净图上折叠后立即 Ctrl+S/返回文件库会被 writeOnce 的 !dirty 早退吞掉，
    // 折叠静默丢失（sidecar 仍 collapsed:[]）。SET_NODE_EXPAND 命令完成即同步上报，不再依赖节流事件；
    // 白名单外不转发（SET_NODE_DATA 会被悬停/激活等非持久化交互高频触发，误报脏）
    const syncExpand = (name: unknown) => {
      if (typeof name === 'string' && EXPAND_COMMANDS.has(name)) cbRef.current.onDataChange()
    }
    mm.on('afterExecCommand', syncExpand)
    // 选中态上报：引擎无 node_active_clear，取消选中同样经 node_active 发出（首参为 null），
    // 见 docs/notes/engine-api.md「M3 核验」(1)。uid 取节点实例的 .uid（引擎无 getUid 方法，防御式保留）
    const onActive = (...args: unknown[]) => {
      const node = args[0] as { getUid?: () => string; uid?: string } | null | undefined
      const uid = node?.getUid ? node.getUid() : node?.uid
      cbRef.current.onActiveChange?.(typeof uid === 'string' ? uid : null)
    }
    mm.on('node_active', onActive)
    // 双链重建入口挂引擎句柄（M5b Task 3）：EditorView 在保存成功后经 mmRef 调用。
    // 旧差值在重建内按 uid 留档回填（M5d Task 5），故此入口无需 adjust——引擎现存即最新
    ;(mm as MindMapHandle).rebuildLinks = (links) => rebuildEngineLinks(mm, links)
    // 打开净化入口（M5d Task 2/5）：EditorView 在 onReady 调用（purify 传入 sidecar linkAdjust）；
    // 内部等首帧渲染完成后建注册表 → 剥离显示文本 → 按注册表重建连线（registry 经 cbRef 取最新引用）
    ;(mm as MindMapHandle).applyRegistry = (adjust?: LinkAdjust) =>
      applyRegistryToEngine(mm, cbRef.current.registry, adjust)
    cbRef.current.onReady(mm)

    // 键盘录入走 window 层：焦点在 body/SVG 时容器级监听收不到事件；
    // 引擎编辑框（contenteditable）与按钮等交互元素内不拦截，保证正常输入与 Tab 导航
    // defaultPrevented 守卫：引擎 KeyCommand 已在 window 上原生注册 Tab/Enter/Del 快捷键
    // （注册先于本监听，命中即 preventDefault），此处仅作其未响应场景（如焦点落在非 body
    // 元素）的兜底，否则同一次按键会双份 execCommand（Tab 插两个子节点，E2E 复制用例发现）
    const onKeydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const t = e.target
      // 文本编辑框（input/textarea/contenteditable）内不拦截：框内原生撤销与正常输入优先于撤销重做兜底
      if (t instanceof Element && t.closest('input, textarea, [contenteditable="true"]')) return
      // 撤销/重做兜底（v1.1）：引擎原生 Control+z/y 只认 body 焦点（KeyCommand defaultEnableCheck），
      // 焦点落在砚栏按钮等交互元素时不响应——此处直发命令补位；body 焦点时引擎已 preventDefault 不双发；
      // 对话框开着时不补位（Radix 陷阱困住焦点，引擎本就不响应，维持框下不撤销）。Ctrl+Shift+z 同译
      // FORWARD（编辑类软件惯例；引擎未注册此组合，v1.1 核验）
      const k = e.key.toLowerCase()
      const inDialog = t instanceof Element && t.closest('[role="dialog"]') !== null
      if (!inDialog && (e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y')) {
        mmRef.current?.execCommand(k === 'y' || e.shiftKey ? 'FORWARD' : 'BACK')
        e.preventDefault()
        return
      }
      if (t instanceof Element && t.closest('select, button, a')) return
      const handled = handleEngineKeyDown((cmd) => mmRef.current?.execCommand(cmd), null, e.key)
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKeydown)

    // 引擎无容器尺寸自动监听：窗口最大化/还原时手动重算画布（验收实案：最大化后画布保持原尺寸）
    const onResize = () => mmRef.current?.resize()
    window.addEventListener('resize', onResize)

    // 多行粘贴拦截：引擎编辑框（contenteditable，挂在 document.body）收到含换行的文本时
    // 阻止原生单框粘贴，把原始文本上报给宿主（拆子节点由 EditorView/Task 4 执行）；单行放行给引擎原生行为
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target
      if (!(t instanceof Element) || !t.closest('[contenteditable="true"]')) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text.includes('\n') && !text.includes('\r')) return
      e.preventDefault()
      cbRef.current.onEditorPaste?.(text)
    }
    window.addEventListener('paste', onPaste)

    return () => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('paste', onPaste)
      mm.off('node_active', onActive)
      mm.off('data_change', changed)
      mm.off('afterExecCommand', syncExpand)
      mm.destroy()
      mmRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时初始化，文档切换由父组件 key 重挂载实现
  }, [])

  // 主题切换（M4）：setTheme 即时重渲染不重挂载（引擎 index.js:379-386，清选中→重绘→view_theme_change）；
  // themeRef 初值即挂载期 theme，构造已生效的值不重复调用
  const themeRef = useRef(theme)
  useEffect(() => {
    if (theme && themeRef.current !== theme) {
      themeRef.current = theme
      mmRef.current?.setTheme(theme)
    }
  }, [theme])

  // role=application：向辅助技术标明这是应用区域（键盘交互在上方 window 监听中处理）
  return <div ref={containerRef} role="application" style={{ width: '100%', height: '100%' }} />
}
