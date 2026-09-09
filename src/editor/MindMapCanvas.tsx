import { useEffect, useRef, useState } from 'react'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
// 关联线几何工具（M5d Task 5 弯曲记忆）：端点定位与默认控制点算式，与引擎 addLine 同源（见下方 defaultControlOffsets）
import {
  computeNodePoints,
  computeCubicBezierPathPoints,
} from 'simple-mind-map/src/plugins/associativeLine/associativeLineUtils.js'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { ResolvedLink } from '../services/links'
import { stripMarkers } from '../services/linkMarkers'
import { sanitizeExecArgs } from '../services/multiline'
import { createNoteTooltip, type NoteTooltip } from './noteTooltip'
import { createImgTooltip, engineImgMapGet } from './imgTooltip'
import { collectUncuratedIcons, registerIconsInto, toEngineIconList, safeReRender, type ReRenderTarget } from './zenIcons'
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
import NodeContextMenu from './NodeContextMenu'

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

// 方向键导航插件（M12a Task 3）：Left/Up/Right/Down 在节点间按几何最近移动选中（阴影→区域→简单三算法
// 逐级兜底，GO_TARGET_NODE 聚焦）；无选中时任意方向键聚焦根。只注册四个裸方向键（键码多重集精确匹配，
// Shift/Ctrl 组合不命中），Tab/Enter/Delete 仍由引擎原生快捷键 + 宿主兜底层负责，互不触碰；
// 编辑框打开期间引擎经 keyCommand.save() 清空快捷键表，框内方向键只走光标移动——三项核验见
// docs/notes/engine-api.md「v1.2 核验」
// eslint-disable-next-line react-hooks/rules-of-hooks -- 引擎静态注册 API，非 React Hook（use 前缀误报，同上）
MindMap.usePlugin(KeyboardNavigation)

// 框选多选插件（2026-09 圈选批量操作）：默认选项下两种起手手势——空白处 Ctrl/Cmd+左键拖拽
// （View.js:44 Ctrl 拖拽不触发平移，与左键 pan 天然咬合）或空白处裸右键拖拽（Select.js:49-54
// which===3 分支；右键松开的 contextmenu 清选中有 5px 位移判定兜底，Render.js:470-486，拖拽
// 圈选不误清）。命中测试 300ms 节流（checkInNodes），框内节点动态进出 activeNodeList；批量删除
// （REMOVE_NODE 无参删全部激活节点）与批量拖拽（Drag.js:258-273 按激活列表拖全部顶层祖先）
// 引擎原生支持。圈选框颜色引擎硬编码 #0984e3，宿主以 CSS 覆盖（见 App.css，不改 node_modules）。
// eslint-disable-next-line react-hooks/rules-of-hooks -- 引擎静态注册 API，非 React Hook（use 前缀误报，同上）
MindMap.usePlugin(Select)

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
 *  收起态全量语义（2026-09 数据丢失修复）：清键/索引/写 targets 走**数据树**（renderer.renderTree，
 *  含收起隐藏子树）——渲染树只含可见节点，走它则隐藏节点陈旧键清不掉、targets 写不上，重开展开后
 *  无线（「收起→保存→重开→连线消失」根因）。渲染实例仅用于几何兜底：隐藏节点无实例，该线位补不出
 *  默认差值 → 整节点放弃 offsets（展开后引擎按默认曲线画）。具名导出供 rebuildLinks.test 直测。
 *  同名消歧（2026-09-03 spec §4.4）：byPath 为"路径→节点数组"，无序号=首位孪生（原后写覆盖=末位，语义变更）。 */
export function rebuildEngineLinks(mm: MindMapHandle, links: ResolvedLink[], adjust?: LinkAdjust): void {
  const run = (): void => {
    const dataRoot = mm.renderer?.renderTree
    if (!dataRoot) return
    // 渲染实例索引（几何兜底用）：uid → 实例；收起子树内的节点无实例
    const instanceByUid = new Map<string, EngineNodeInstance>()
    const instRoot = mm.renderer?.root as EngineNodeInstance | null | undefined
    if (instRoot) {
      const walkInst = (node: EngineNodeInstance): void => {
        const uid = node.getData('uid')
        if (typeof uid === 'string') instanceByUid.set(uid, node)
        for (const child of node.children ?? []) walkInst(child)
      }
      walkInst(instRoot)
    }
    const byPath = new Map<string, EngineNode[]>()
    const pathByNode = new Map<EngineNode, string>()
    const pathByUid = new Map<string, string>()
    // 清键前按 uid 留档既有差值：重建后按 uid 回填（索引顺序可能因增删线漂移，uid 才是稳定锚）
    const existingByUid = new Map<EngineNode, Map<string, [ControlPointOffset, ControlPointOffset]>>()
    const walk = (node: EngineNode, parentPath: string): void => {
      const path = parentPath === '' ? '/' + String(node.data.text) : parentPath + '/' + String(node.data.text)
      const twins = byPath.get(path) ?? []
      twins.push(node)
      byPath.set(path, twins)
      pathByNode.set(node, path)
      if (typeof node.data.uid === 'string') pathByUid.set(node.data.uid, path)
      const oldTargets = node.data.associativeLineTargets
      const oldOffsets = node.data.associativeLineTargetControlOffsets
      if (Array.isArray(oldTargets) && Array.isArray(oldOffsets)) {
        const kept = new Map<string, [ControlPointOffset, ControlPointOffset]>()
        oldTargets.forEach((t, i) => {
          if (typeof t !== 'string') return
          const pair = normalizeEngineOffsets(oldOffsets[i])
          if (pair !== undefined) kept.set(t, pair)
        })
        if (kept.size > 0) existingByUid.set(node, kept)
      }
      for (const key of ASSOCIATIVE_KEYS) delete node.data[key]
      for (const child of node.children ?? []) walk(child, path)
    }
    walk(dataRoot, '')
    /** 路径 + 孪生序号取节点（文档序 1 起；缺省/越界钳位——resolveLinks 已钳，防御双保险） */
    const pick = (path: string, ordinal?: number): EngineNode | undefined => {
      const twins = byPath.get(path)
      if (twins === undefined || twins.length === 0) return undefined
      return twins[Math.min(Math.max(ordinal ?? 1, 1), twins.length) - 1]
    }
    const targets = new Map<EngineNode, string[]>()
    for (const { fromPath, toPath, fromOrdinal, toOrdinal } of links) {
      const from = pick(fromPath, fromOrdinal)
      const to = pick(toPath, toOrdinal)
      const uid = to?.data.uid
      if (!from || !to || from === to || typeof uid !== 'string') continue
      const list = targets.get(from) ?? []
      if (!list.includes(uid)) list.push(uid)
      targets.set(from, list)
    }
    targets.forEach((uids, from) => {
      from.data.associativeLineTargets = uids
      const pairs = resolveLinkOffsets(uids, pathByNode.get(from)!, pathByUid, existingByUid.get(from) ?? new Map(), adjust)
      if (!pairs.some((p) => p !== undefined)) return // 全线无弯曲：不写 offsets，渲染按默认曲线
      // 空洞补引擎默认差值（addLine 同款算式，AssociativeLine.js:609-632）：差值相对当前端点，
      // 与节点后续重排解耦（引擎保存差值正为此）；端点任一无渲染实例（收起隐藏）或几何不可得
      // 时整节点放弃（宁缺勿稀疏）
      const dense: Array<[ControlPointOffset, ControlPointOffset]> = []
      for (let i = 0; i < uids.length; i++) {
        const pair = pairs[i]
        if (pair !== undefined) {
          dense[i] = pair
          continue
        }
        const fromInst = typeof from.data.uid === 'string' ? instanceByUid.get(from.data.uid) : undefined
        const toInst = instanceByUid.get(uids[i]!)
        const fallback = fromInst && toInst ? defaultControlOffsets(fromInst, toInst) : undefined
        if (fallback === undefined) return
        dense[i] = fallback
      }
      from.data.associativeLineTargetControlOffsets = dense
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

/** 打开/保存后再净化（M5d Task 2 + v0.7.0 验收修复 + 2026-09 收起态修复）：等首帧渲染后——
 *  ①harvestRegistry 按**数据树**（renderer.renderTree，含收起隐藏子树）现态重建注册表（打开时
 *  引擎 targets 恒空＝纯文本标记建表；保存后收割含引擎 targets——删线修剪后的现态为权威，替换
 *  语义不残留陈旧条目；隐藏节点同样收割，否则收起子树内的连线条目丢失）；
 *  ②data 本体直写 stripTreeTexts 剥离显示文本（同 rebuildEngineLinks 直写通道：不进命令层、
 *  无历史、无 data_change → 打开净化不置脏；全量剥离——隐藏节点也剥，否则重开展开后残留
 *  [[..]] 标记既暴露画布、又随文本编辑被吞，连线唯一事实源永久丢失）；③可见节点按需重渲
 *  （文本变短重算尺寸；隐藏节点无实例无需重渲，展开重建时数据已干净）；
 *  ④按注册表重建连线（rebuildEngineLinks 同走数据树，隐藏节点 targets 落位，展开即自动画线）。
 *  adjust（M5d Task 5）＝打开时 sidecar linkAdjust，随重建一并恢复用户拖过的弯曲；
 *  保存后入口（onSaved）不传 adjust——引擎现存差值即最新（rebuildEngineLinks 内按 uid 留档回填）。
 *  具名导出供 rebuildLinks.test 直测（组件本体仍由 E2E 覆盖，不变）。 */
export function applyRegistryToEngine(mm: MindMapHandle, reg: LinkRegistry, adjust?: LinkAdjust): void {
  const run = (): void => {
    const dataRoot = mm.renderer?.renderTree
    const instRoot = mm.renderer?.root as EngineNodeInstance | null | undefined
    if (!dataRoot || !instRoot) return
    // 需重渲的可见实例：文本含标记（剥离后变短须重算尺寸）；隐藏节点无实例，展开时按已剥离数据重建
    const changed: EngineNodeInstance[] = []
    const collectChanged = (node: EngineNodeInstance): void => {
      const text = node.getData('text')
      if (typeof text === 'string' && stripMarkers(text) !== text) changed.push(node)
      for (const child of node.children ?? []) collectChanged(child)
    }
    collectChanged(instRoot)
    harvestRegistry(dataRoot, reg)
    stripTreeTexts(dataRoot)
    for (const node of changed) mm.renderer?.reRenderNodeCheckChange(node)
    rebuildEngineLinks(mm, registryToLinks(dataRoot, reg), adjust)
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
  onActiveChange?: (uids: string[]) => void
  /** 正文角标悬停上报（2026-09-09 悬停优先修复）：customNoteContentShow.show 第四参
   *  （悬停节点实例，nodeCreateContents.js:466）提取 uid；hide 上报 null = 退场。
   *  Shift+F2 热键据此优先编辑被预览节点（悬停不产生选中） */
  onNoteHover?: (uid: string | null) => void
  onEditorPaste?: (rawText: string) => void
  /** 画布态（非编辑框/输入框/对话框）粘贴图片：clipboardData 由 paste 事件同步携带
   *  （免 navigator.clipboard.read 权限弹窗）；宿主异步读 bytes 并落盘 assets/ 应用 */
  onCanvasImagePaste?: (clipboardData: DataTransfer) => void
  /** 画布态粘贴文本（smm 节点 JSON 或普通文本）：宿主分派（canvasPaste.ts） */
  onCanvasPasteText?: (text: string) => void
  /** Control+Shift+c 画布内复制节点成功（有选中，快捷键对调后的引擎路径）→ 宿主盖印记 */
  onNodeCopy?: () => void
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
  onNoteHover,
  onEditorPaste,
  onCanvasImagePaste,
  onCanvasPasteText,
  onNodeCopy,
  layout,
  theme,
}: Readonly<Props>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<MindMapHandle | null>(null)
  // 备注悬停窗（M17b）：引擎官方通道 customNoteContentShow 接管渲染（mermaid 备注画布内成图）；
  // tipRef 供主题 effect 引用
  const tipRef = useRef<NoteTooltip | null>(null)
  // 节点右键菜单态（2026-09 纯鼠标操作）：node_contextmenu 坐标 + 节点实例（编辑文本动作
  // 需传实例给 textEdit.show）；null = 关闭（onClose 卸载）。菜单动作全经 activeNodeList 生效
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; isRoot: boolean; node: unknown } | null>(null)
  // 始终持最新回调：挂载 effect 只订阅一次，避免闭包停留在首帧 props（Task 5 遗留加固）
  const cbRef = useRef({ onReady, onDataChange, onActiveChange, onNoteHover, onEditorPaste, onCanvasImagePaste, onCanvasPasteText, onNodeCopy, registry })
  cbRef.current = { onReady, onDataChange, onActiveChange, onNoteHover, onEditorPaste, onCanvasImagePaste, onCanvasPasteText, onNodeCopy, registry }

  useEffect(() => {
    // 悬停窗先建后传（引擎构造期即可能注册 mouseover 钩子）；主题取挂载期值
    const tip = createNoteTooltip(theme === 'zen-night' ? 'dark' : 'light')
    tipRef.current = tip
    const mm = new MindMap({
      el: containerRef.current!,
      data: tree,
      ...(layout ? { layout } : {}),
      ...(theme ? { theme } : {}),
      // 叶节点快捷建子 "+"（验收轮）：引擎原生 quickCreateChildBtn——激活叶节点显示、点击即插入子节点并进入
      // 编辑（INSERT_CHILD_NODE，MindMapNode.js:157/516 按 opt 门控；显式声明防未来默认值漂移）
      isShowCreateChildBtnIcon: true,
      // 撤销历史入栈节流窗（v1.1）：引擎默认 100ms 且窗口内调用**整体丢弃**（utils/index.js:281 纯尾随
      // 节流）——插入与文本提交两条逻辑编辑可能合并为一条历史（粒度损失，最后一条编辑无法单独撤销）。
      // 窗口收到近零后命令变更即时入史（重复入史由 undoSeed 的瞬态键剥离+同值去重吸收）
      addHistoryTime: 1,
      // 关闭构造器自播种子（v1.1 修复，审查裁定①）：引擎默认在构造器里 command.addHistory()（节流后
      // 入史，index.js:163-166）捕获的是**未净化构造数据**——与宿主 seedUndoBaseline「栈非空即跳过」
      // 竞态：自播先落则基线含 [[..]] 标记（打开含连线文件后回退栈底会把标记带回画布，且自播的
      // data_change 开图误置脏）。关闭后净化后的宿主基线种子是唯一确定路径（undoSeed.ts）
      addHistoryOnInit: false,
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
      // 备注悬停窗接管（M17b，nodeCreateContents.js:446-478 官方通道）：设置后引擎不建
      // 内置 noteEl，mermaid 备注在画布悬停即成图（文本段转义、图源 strict SVG）。
      // show 第四参 = 悬停节点实例（引擎 mouseover 回调的 this）→ 提取 uid 上报宿主
      // （2026-09-09 悬停优先：Shift+F2 编辑被预览节点），hide 清 null（uid 取法同 node_active）
      customNoteContentShow: {
        show: (note: string, left: number, top: number, node: unknown) => {
          tip.show(note, left, top)
          const n = node as { getUid?: () => string; uid?: string } | null | undefined
          const uid = n?.getUid ? n.getUid() : n?.uid
          cbRef.current.onNoteHover?.(typeof uid === 'string' ? uid : null)
        },
        hide: () => {
          tip.hide()
          cbRef.current.onNoteHover?.(null)
        },
      },
      // 节点图标集（M18）：lucide 精选 64 经 iconList 通道注册（data.icon 'zen_'+name
      // 解析到此处 svg）；全集新图标由 useIconPicker 运行时 push 进本数组
      iconList: toEngineIconList(),
      // 节点标签渲染上限（引擎默认 5）：to-do 分类场景放宽到 10（超限静默截断，与引擎一致）
      maxTag: 10,
    })
    // 提交口换行归一化（2026-09-07 Word 粘贴毒节点治本）：引擎编辑框提交（TextEdit.js:492
    // 经 this.mindMap.execCommand）与宿主正文面板写入在此统一剥 \r\n/裸 \r——残留换行命中
    // serialize 断言（复制/保存抛错）或污染 md 落盘（重开毒害标题）。引擎内部调用取实例
    // 属性，包装对引擎与宿主（mmRef）双端生效
    const origExec = mm.execCommand.bind(mm)
    mm.execCommand = ((cmd: string, ...args: unknown[]) =>
      origExec(cmd, ...sanitizeExecArgs(cmd, args))) as MindMapHandle['execCommand']
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
    // 选中态上报：引擎无 node_active_clear，取消选中同样经 node_active 发出。事件载荷为
    // (node, activeNodeList) 二参（Render.js:456-467，setTimeout(0) 去抖 + 同表不发）——单选时
    // 两参一致，圈选/多选时首参可为 null（Select.checkInNodes → emitNodeActiveEvent() 无参调用），
    // 故以第二参激活列表为权威，提取 uid 数组上报（圈选镜像，docs/notes/engine-api.md）。
    // uid 取节点实例的 .uid（引擎无 getUid 方法，防御式保留）
    const onActive = (...args: unknown[]) => {
      const list = args[1] as Array<{ getUid?: () => string; uid?: string } | null | undefined> | null | undefined
      const uids = (list ?? [])
        .map((n) => (n?.getUid ? n.getUid() : n?.uid))
        .filter((u): u is string => typeof u === 'string')
      cbRef.current.onActiveChange?.(uids)
    }
    mm.on('node_active', onActive)
    // 节点右键菜单（2026-09 纯鼠标操作）：引擎在节点 svg 上 stopPropagation 后 emit 本事件
    // （MindMapNode.js:432-456），DOM 包装层收不到——菜单只能经引擎事件总线受控打开。引擎已
    // 在发事件前把右键节点设为单选（多选选区切为单选，批量删仍走 MultiSelectBar；空白右键/
    // 只读/圈选拖拽中不触发，引擎门控）。此处只取坐标与节点，四项动作见 render 段
    const onNodeCtxMenu = (...args: unknown[]) => {
      const e = args[0] as MouseEvent | null | undefined
      const node = args[1] as { isRoot?: boolean } | null | undefined
      if (!e || !node) return
      setNodeMenu({ x: e.clientX, y: e.clientY, isRoot: node.isRoot === true, node })
    }
    mm.on('node_contextmenu', onNodeCtxMenu)
    // 快捷键对调：裸 Ctrl+C 让给宿主复制 Markdown（useEditorHotkeys doCopy，md 复制高频），
    // 引擎原生 Control+c 复制节点挪至 Control+Shift+c（Render.js:438 注册的是匿名箭头函数拿不到
    // 引用，removeShortcut 不传 fn 整组删除后重挂 copy）。编辑框打开期引擎 keyCommand.save()/
    // restore() 缓存/恢复整个 shortcutMap 引用，此注册随之存取不丢；引擎命中时 preventDefault+
    // stopPropagation 不拦同 window 后绑的宿主监听（同元素后续监听照常收，engine-api.md「M1 核验」）
    mm.keyCommand.removeShortcut('Control+c')
    mm.keyCommand.addShortcut('Control+Shift+c', () => {
      mm.renderer.copy()
      // 成功判定 = 有选中节点（Render.copy 无选中时 copyNode() 返回 undefined 即 no-op）；
      // 印记经 cbRef 上报 EditorView 盖「已复制为节点」墨青印
      if ((mm.renderer.activeNodeList ?? []).length > 0) cbRef.current.onNodeCopy?.()
    })
    // 画布粘贴接管（2026-09 贴图落盘修复）：引擎原生 Control+v（Render.js:446）→ paste()
    // 第一步 navigator.clipboard.read() 触发 WebView2「是否允许访问剪贴板」权限弹窗
    // （拒绝后连文本粘贴一并失效），且剪贴板图片被 loadImage 转 base64 dataURL 直写
    // data.image——保存链把整段 base64 糊进 md 文件（AI 不可读、文件膨胀）。移除引擎
    // 快捷键后由下方 window paste 监听接管：clipboardData 免权限、图片走宿主落盘链
    // （assets/ 相对路径），文本/smm 分派复刻引擎语义（canvasPaste.ts）。
    // 编辑框打开期 keyCommand.save()/restore() 缓存/恢复 shortcutMap 引用——本移除
    // 先于任何 save 执行，缓存表已不含 Control+v，同 Control+c 接管（见上）
    mm.keyCommand.removeShortcut('Control+v')
    // 双链重建入口挂引擎句柄（M5b Task 3）：EditorView 在保存成功后经 mmRef 调用。
    // 旧差值在重建内按 uid 留档回填（M5d Task 5），故此入口无需 adjust——引擎现存即最新
    ;(mm as MindMapHandle).rebuildLinks = (links) => rebuildEngineLinks(mm, links)
    // 打开净化入口（M5d Task 2/5）：EditorView 在 onReady 调用（purify 传入 sidecar linkAdjust）；
    // 内部等首帧渲染完成后建注册表 → 剥离显示文本 → 按注册表重建连线（registry 经 cbRef 取最新引用）
    ;(mm as MindMapHandle).applyRegistry = (adjust?: LinkAdjust) =>
      applyRegistryToEngine(mm, cbRef.current.registry, adjust)
    // 设节点图标（M18）：按 uid 定位渲染节点 → node.setIcon（SET_NODE_ICON 命令，入历史）
    ;(mm as MindMapHandle).execCommandIcon = (uid, icons) => {
      const node = mm.renderer.findNodeByUid(uid) as
        | { setIcon?(icons: string[]): void }
        | null
        | undefined
      node?.setIcon?.(icons)
    }
    // 设节点标签：node.setTag → SET_NODE_TAG 命令（nodeCommandWraps.js:37，入历史）；
    // data.tag 字符串数组经引擎原生彩色小标签渲染（颜色按文本稳定生成——同名同色）
    ;(mm as MindMapHandle).execCommandTag = (uid, tags) => {
      const node = mm.renderer.findNodeByUid(uid) as
        | { setTag?(tags: string[]): void }
        | null
        | undefined
      node?.setTag?.(tags)
    }
    // 设节点插图（M19）：node.setImage → SET_NODE_IMAGE 命令（Render.js:1760 setNodeImage
    // 解构 { url, title, width, height, custom } 后落 data.image/imageTitle/imageSize——
    // 装配层做形态转换；image 置空即移除）
    ;(mm as MindMapHandle).execCommandImage = (uid, imgData) => {
      const node = mm.renderer.findNodeByUid(uid) as
        | { setImage?(d: unknown): void }
        | null
        | undefined
      node?.setImage?.({
        url: imgData.image,
        title: imgData.imageTitle,
        width: imgData.imageSize.width,
        height: imgData.imageSize.height,
        custom: imgData.imageSize.custom,
      })
    }
    // 悬停看大图（M19 验收）：引擎 createImgNode 在图片元素上发 node_img_mouseenter/
    // mouseleave（nodeCreateContents.js:81-84），经 imgTooltip 浮层显示原图（dataURL）
    const imgTip = createImgTooltip()
    mm.on('node_img_mouseenter', (...args: unknown[]) => {
      const node = args[0] as { getData?(): { image?: unknown } } | null | undefined
      const raw = node?.getData?.().image
      if (typeof raw !== 'string' || raw === '') return
      const url = engineImgMapGet(mm, raw)
      if (url !== null) imgTip.show(url, args[2] as MouseEvent)
    })
    mm.on('node_img_mouseleave', () => imgTip.hide())
    // 打开期图标恢复（2026-09 修复）：非精选图标（如 ::shield-alert）此前只在图标管理器
    // 确认时运行时注册进 iconList，重开导图后此处 iconList 只剩精选 64，引擎对无 svg 的
    // data.icon 渲染空占位——挂载后扫描整树补注册并整树重渲染（与 useIconPicker.apply 的
    // 注册段同构）。mmRef 同引用守卫防卸载后迟到 reRender；reRender 须走 safeReRender
    // （2026-09 双树错乱修复）：registerIconsInto 异步 resolve 可能恰逢渲染进行中，裸
    // reRender 会致画布新旧两份完整树并存（详见 zenIcons.ts safeReRender 注释）
    const uncurated = collectUncuratedIcons(tree)
    const iconTarget = (mm as MindMapHandle).opt?.iconList?.[0]
    if (uncurated.length > 0 && iconTarget !== undefined) {
      void registerIconsInto(iconTarget.list, uncurated).then((added) => {
        if (added > 0 && mmRef.current === (mm as MindMapHandle)) safeReRender(mm as unknown as ReRenderTarget)
      })
    }
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

    // 引擎无容器尺寸自动监听：窗口最大化/还原时手动重算画布（验收实案：最大化后画布保持原尺寸）。
    // 0×0 门禁（2026-09 最小化恢复错乱修复）：WebView2 在睡眠唤醒/显示器拓扑/DPI 切换等系统事件下，
    // 可能在窗口不可见期间投递视口 0×0 的 resize——引擎 getElRectInfo（index.js:316-321）会先把 0
    // 写入 width/height/elRect 再抛错；污染固化后任何渲染（编辑/展开/保存链重绘）都把根节点定位到
    // (0-w)/2≈0、全树平移出视口，且节点坐标全错致拖拽落点在视口外（错乱+拖不动的完整链路已实验
    // 复现，见 e2e/canvas.spec.ts「容器瞬时 0×0」用例）。无效尺寸直接跳过，等恢复后有效 resize 自然
    // 重算；try/catch 兜底引擎其余抛错路径，不炸 window resize 链。
    const safeResize = () => {
      const mm = mmRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (!mm || !rect || rect.width <= 0 || rect.height <= 0) return
      try {
        mm.resize()
      } catch {
        // 0×0 已被门禁前置拦截，此为引擎其余防御性抛错的兜底；静默跳过，待下次有效 resize
      }
    }
    const onResize = () => safeResize()
    window.addEventListener('resize', onResize)
    // 自愈补偿（同上修复）：恢复可见的第一个可靠信号是 focus（实测 WebView2 最小化/恢复既不发
    // resize 也不发 visibilitychange，只发 blur/focus）。若引擎尺寸已因污染偏离容器、或恢复时的
    // resize 事件丢失，此处补一次重算——一次有效 resize 即完全恢复（root 归位居中，实验验证）
    const onHealCheck = () => {
      const mm = mmRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (!mm || !rect || rect.width <= 0 || rect.height <= 0) return
      if (mm.width === rect.width && mm.height === rect.height) return
      safeResize()
    }
    window.addEventListener('focus', onHealCheck)

    // 粘贴三分派（2026-09 画布贴图落盘）：①引擎编辑框（contenteditable，挂在
    // document.body）含换行文本 → 拦截上报宿主拆子节点（既有行为；单行放行给引擎
    // handleInputPasteText，框内贴图被其总 preventDefault 后丢弃，安全 no-op）；
    // ②输入框/对话框 → 不接管（原生文本粘贴、ImageDialog 自理 Ctrl+V 贴图）；
    // ③画布态（焦点在 body/容器）→ 宿主接管：图片优先（bytes 读取与落盘由宿主异步
    // 处理，preventDefault 必须在事件派发内同步完成），否则文本分派（smm/普通）。
    // 引擎 Control+v 已移除（见上），keydown 无人消费 → 浏览器照发 paste 事件，
    // clipboardData 同步可读且不经 navigator.clipboard.read 权限 API
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('[contenteditable="true"]')) {
        const text = e.clipboardData?.getData('text/plain') ?? ''
        if (!text.includes('\n') && !text.includes('\r')) return
        e.preventDefault()
        cbRef.current.onEditorPaste?.(text)
        return
      }
      if (t.closest('input, textarea, [role="dialog"]')) return
      const cd = e.clipboardData
      if (cd === null) return
      const hasImg = Array.from(cd.items ?? []).some((i) => i.type.startsWith('image/'))
      if (hasImg) {
        e.preventDefault()
        cbRef.current.onCanvasImagePaste?.(cd)
        return
      }
      const text = cd.getData('text/plain')
      if (text === '') return
      e.preventDefault()
      cbRef.current.onCanvasPasteText?.(text)
    }
    window.addEventListener('paste', onPaste)

    return () => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('focus', onHealCheck)
      window.removeEventListener('paste', onPaste)
      mm.off('node_active', onActive)
      mm.off('node_contextmenu', onNodeCtxMenu)
      mm.off('data_change', changed)
      mm.off('afterExecCommand', syncExpand)
      mm.destroy()
      tip.destroy()
      imgTip.destroy()
      tipRef.current = null
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
      // 悬停窗同随主题（显示中内容按新主题重渲染）
      tipRef.current?.setTheme(theme === 'zen-night' ? 'dark' : 'light')
    }
  }, [theme])

  // role=application：向辅助技术标明这是应用区域（键盘交互在上方 window 监听中处理）；
  // 右键节点时条件挂载菜单（NodeContextMenu 自带 fixed 锚点与 Portal，不影响画布布局）
  return (
    <>
      <div ref={containerRef} role="application" style={{ width: '100%', height: '100%' }} />
      {nodeMenu !== null && (
        <NodeContextMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          isRoot={nodeMenu.isRoot}
          onInsertChild={() => mmRef.current?.execCommand('INSERT_CHILD_NODE')}
          onInsertSibling={() => mmRef.current?.execCommand('INSERT_NODE')}
          onEditText={() => {
            // 引擎 F2 同款路径（TextEdit.js:93）：show 定位并聚焦指定节点的编辑框。
            // 须推迟到下一宏任务：菜单 Portal 挂在 body 下，菜单项 click 冒泡到 body 会被
            // 引擎当作"点画布外提交编辑框"（Event.onBodyClick → body_click → hideEditTextBox，
            // 与本次 click 同一派发内）——同步 show 会在 9ms 内被藏掉（e2e 实测抓栈）；
            // 延后后 body_click 先落在未打开态（hideEditTextBox 空操作），编辑框稳定打开
            setTimeout(() => mmRef.current?.renderer?.textEdit.show({ node: nodeMenu.node }), 0)
          }}
          onDelete={() => mmRef.current?.execCommand('REMOVE_NODE')}
          onClose={() => setNodeMenu(null)}
        />
      )}
    </>
  )
}
