import { useEffect, useRef } from 'react'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import type { EngineNode, MindMapHandle } from '../types/engine'
import type { ResolvedLink } from '../services/links'
import { handleEngineKeyDown } from './engineKeyboard'
import { registerZenThemes } from './engineThemes'

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

/** 渲染树节点实例的最小结构（MindMapNode）：getData() 无参返回 nodeData.data 活引用（引擎核验 M5b Task 3） */
interface EngineNodeInstance {
  getData(key?: string): unknown
  children?: EngineNodeInstance[]
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
 *  故后续文本编辑引起的重排无需再触发本函数。自环丢弃（引擎 UI completeCreateLine 同语义）。 */
function rebuildEngineLinks(mm: MindMapHandle, links: ResolvedLink[]): void {
  const run = (): void => {
    const root = mm.renderer?.root as EngineNodeInstance | null | undefined
    if (!root) return
    const byPath = new Map<string, EngineNodeInstance>()
    const walk = (node: EngineNodeInstance, parentPath: string): void => {
      const text = node.getData('text')
      const path = parentPath === '' ? '/' + String(text) : parentPath + '/' + String(text)
      byPath.set(path, node)
      const data = node.getData() as Record<string, unknown> | undefined
      if (data) for (const key of ASSOCIATIVE_KEYS) delete data[key]
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
      if (data) data.associativeLineTargets = uids
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

interface Props {
  tree: EngineNode
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
  const cbRef = useRef({ onReady, onDataChange, onActiveChange, onEditorPaste })
  cbRef.current = { onReady, onDataChange, onActiveChange, onEditorPaste }

  useEffect(() => {
    const mm = new MindMap({
      el: containerRef.current!,
      data: tree,
      ...(layout ? { layout } : {}),
      ...(theme ? { theme } : {}),
    })
    mmRef.current = mm
    // data_change 附带整树快照透传（宿主据此判定「与已落盘一致」的同值事件，见 EditorView）；
    // 无载荷的调用（下方展开命令同步上报）视为必有变化
    const changed = (...args: unknown[]) => cbRef.current.onDataChange(args[0] as EngineNode | undefined)
    mm.on('data_change', changed)
    // 展开/收起即时上报（验收修复 4）：引擎 data_change 经 addHistory 尾随节流（默认 100ms）延迟发出，
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
    // 双链重建入口挂引擎句柄（M5b Task 3）：EditorView 在 onReady 与保存成功后经 mmRef 调用
    ;(mm as MindMapHandle).rebuildLinks = (links) => rebuildEngineLinks(mm, links)
    cbRef.current.onReady(mm)

    // 键盘录入走 window 层：焦点在 body/SVG 时容器级监听收不到事件；
    // 引擎编辑框（contenteditable）与按钮等交互元素内不拦截，保证正常输入与 Tab 导航
    // defaultPrevented 守卫：引擎 KeyCommand 已在 window 上原生注册 Tab/Enter/Del 快捷键
    // （注册先于本监听，命中即 preventDefault），此处仅作其未响应场景（如焦点落在非 body
    // 元素）的兜底，否则同一次按键会双份 execCommand（Tab 插两个子节点，E2E 复制用例发现）
    const onKeydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const t = e.target
      if (
        t instanceof Element &&
        t.closest('input, textarea, select, button, a, [contenteditable="true"]')
      ) {
        return
      }
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
