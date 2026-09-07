// src/types/engine.ts —— 引擎节点最小结构类型，避免依赖引擎包类型
import type { ResolvedLink } from '../services/links'
import type { LinkAdjust } from '../services/linkAdjust'

export interface EngineNode {
  data: { text: string; expand?: boolean; [k: string]: unknown }
  children?: EngineNode[]
}

/** 引擎节点实例的盒子字段（MindMapNode.js：布局后为画布内容坐标系下的绝对值） */
export interface NodeBox {
  left: number
  top: number
  width: number
  height: number
  children?: NodeBox[]
}

/** 引擎渲染器（MindMapHandle.renderer）：本项目用到的成员，核验见 docs/notes/engine-api.md「M3 核验」「M5b 核验」 */
export interface EngineRenderer {
  /** 按节点 uid 查渲染树节点实例（引擎 Render.js:2094）；未命中返回 null/undefined */
  findNodeByUid(uid: string): unknown
  /** 引擎文本编辑框：show 打开指定节点的编辑框（引擎 F2/双击同款路径，TextEdit.js:49/93）；
   *  hideEditTextBox 关闭并提交框内当前内容（TextEdit.js:475），未打开时为无害空操作 */
  textEdit: {
    show(opts: { node: unknown }): void
    hideEditTextBox(): void
  }
  /** 改节点数据后按需重渲（引擎 Render.js:1997）：node.reRender() 重建内容，尺寸变化时全图重排。
   *  裸 SET_NODE_DATA 不重渲染（M5b 核验 13），备注角标增删后须补调 */
  reRenderNodeCheckChange(node: unknown, notRender?: boolean): void
  /** 渲染树根节点实例（Render.js:601）；未渲染时为 null */
  root?: NodeBox | null
  /** 数据树（Render.js:81 构造数据 / :749 撤销恢复）：与渲染实例共享 data 本体，**含收起隐藏子树**
 *  （收起只改 data.expand，节点不出渲染树但保留在数据树）。连线净化/重建以此为全量数据源
 *  （走渲染树会遗漏隐藏节点：标记残留被文本编辑吞噬 → 连线永久丢失，2026-09 修复） */
  renderTree?: EngineNode | null
  /** 复制选中节点（Render.js:1195）：写入引擎内部剪贴板（beingCopyData，供 Control+v 画布内
   *  粘贴节点）并同步系统剪贴板 smm 格式数据；快捷键对调后由 Control+Shift+c 触发（MindMapCanvas） */
  copy(): void
  /** 当前激活（选中）节点实例数组（Render.js 维护）：无选中为空数组——Control+Shift+c
   *  复制成功的判定依据（无选中 copy() 为 no-op，不上报盖印） */
  activeNodeList?: unknown[]
}

/** 引擎快捷键层（MindMapHandle.keyCommand，KeyCommand.js）：window keydown 按键多重集匹配，
 *  命中即 preventDefault+stopPropagation；defaultEnableCheck 只认 body 焦点（editNodeClassList
 *  除外）。编辑框打开期引擎以 save()/restore() 缓存/恢复整个 shortcutMap，宿主注册随之存取不丢 */
export interface EngineKeyCommand {
  /** 注册快捷键（key 形如 'Control+Shift+c'，'|' 分隔多键）；同键多次注册追加回调 */
  addShortcut(key: string, fn: () => void): void
  /** 移除快捷键：不传 fn 删整组（引擎注册的匿名箭头函数拿不到引用，只能整组删） */
  removeShortcut(key: string): void
}

/** 导出插件实例面（MindMapHandle.doExport，M5b Task 5）：返回 data URL 字符串（非 Blob），见上方 doExport 注释 */
export interface EngineExport {
  png(name?: string): Promise<string>
  svg(name?: string): Promise<string>
}

/** 关联线插件实例面（MindMapHandle.associativeLine，usePlugin(AssociativeLine) 后构造时挂载，
 *  instanceName='associativeLine'）：建线态入口与状态（验收轮连线文本桥接，见 editor/linkBridge.ts） */
export interface EngineAssociativeLine {
  /** 从当前激活节点发起建线（activeNodeList[0] 为源，AssociativeLine.js:449）：进入建线态，线随光标，点目标节点完成 */
  createLineFromActiveNode(): void
  /** 取消建线态（:483）：completeCreateLine 的 stop 路径不调用，宿主桥接须自理 */
  cancelCreateLine(): void
  /** 建线态源节点实例（createLine :477 写入，cancel 置 null）——opt 钩子只收到 toNode，源从这里取 */
  creatingStartNode?: unknown
  /** 建线态悬停目标节点（checkOverlapNode :541 写入）：引擎 stop 路径跳过其去激活（:572-574），
   *  桥接自理（否则目标高亮残留 + 尾随 data_change 清 activeLine 使删线失效，v0.7.0 验收实案） */
  overlapNode?: unknown
  /** 建线态标志（createLine 置 true）：宿主浮动条等据此避让 */
  isCreatingLine?: boolean
}

/** 引擎视图（MindMapHandle.view）：x/y/scale 为可直接赋值的变换状态，改后须调 transform() 生效（View.js） */
export interface EngineView {
  reset(): void
  narrow(cx?: number, cy?: number, isTouchPad?: boolean): void
  enlarge(cx?: number, cy?: number, isTouchPad?: boolean): void
  x: number
  y: number
  scale: number
  transform(): void
}

/** 引擎命令层（MindMapHandle.command，Command.js）：撤销历史栈为字符串数组（JSON 快照）+ 活动指针。
 *  v1.1（engine-api.md「v1.1 核验」）：引擎构造器默认自播种子（addHistoryOnInit: true，index.js:163-166）
 *  捕获未净化构造数据，本仓以 addHistoryOnInit: false 关闭，净化后的宿主基线种子（editor/undoSeed.ts）
 *  是唯一路径；引擎另有 setData/updateData/setMode 三个补种入口（本项目不走） */
export interface EngineCommand {
  /** 历史栈：JSON 字符串形式的整树快照（back/forward 按 JSON.parse 恢复） */
  history: string[]
  /** 活动指针（canUndo = index > 0，canRedo = index < history.length - 1，驱动砚栏按钮禁用态） */
  activeHistoryIndex: number
  /** 越过节流立即入史并连带 data_change/back_forward（setMode 补种子用的官方入口；宿主种子不走它，见 undoSeed） */
  originAddHistory(): void
}

export interface MindMapHandle {
  getData(): EngineNode
  execCommand(cmd: string, ...args: unknown[]): void
  /** 引擎 opts 引用（构造入参原对象；iconList 等运行时可变项经此增补，M18） */
  opt?: { iconList?: Array<{ type: string; list: Array<{ name: string; icon: string }> }> }
  /** 设节点图标（M18）：宿主侧装配方法——按 uid 定位渲染节点 → node.setIcon
   *  （nodeCommandWraps.js:18 → SET_NODE_ICON 命令，入历史、触发重渲）；
   *  icons 为引擎 data.icon 形态（'zen_'+name） */
  execCommandIcon?(uid: string, icons: string[]): void
  /** 设节点标签：宿主侧装配方法——node.setTag（nodeCommandWraps.js:37
   *  → SET_NODE_TAG 命令，入历史、触发重渲）；tags 为引擎 data.tag 形态
   *  （字符串数组，渲染彩色小标签、颜色按文本稳定生成）；空数组即移除 */
  execCommandTag?(uid: string, tags: string[]): void
  /** 设节点插图（M19）：宿主侧装配方法——node.setImage（nodeCommandWraps.js:12
   *  → SET_NODE_IMAGE 命令，入历史、触发重渲）；imgData = { image, imageTitle,
   *  imageSize }，image 为 imgMap 键（相对路径），image 清空即移除 */
  execCommandImage?(uid: string, imgData: { image: string; imageTitle: string; imageSize: { width: number; height: number; custom: boolean } }): void
  /** 事件订阅/退订（引擎 EventEmitter 委托，index.js:345/355；MindMapCanvas 经此等首帧渲染完成） */
  on(event: string, cb: (...args: unknown[]) => void): void
  off(event: string, cb: (...args: unknown[]) => void): void
  /** 导出插件（M5b Task 5，usePlugin(Export) 后挂载，instanceName='doExport'）：
   *  png()/svg() 返回 base64 data URL 字符串而非 Blob（canvas.toDataURL / readBlob，engine-api.md「M5b 核验 (a)」）；
   *  svg 的 name 会写入 svg 首元素前的 <title>，png 的 name 未被引擎使用 */
  doExport?: EngineExport
  /** 双链重建（M5b Task 3）：宿主侧方法——MindMapCanvas 装配时挂到引擎实例（非引擎原生 API）；
   *  内部等待首帧渲染完成后按 links 清空并重建关联线（既有控制点差值按 uid 留档回填，M5d Task 5） */
  rebuildLinks?(links: ResolvedLink[]): void
  /** 连线净化/再净化（M5d Task 2/5 + v0.7.0 验收修复）：宿主侧方法——同上装配挂载；等首帧渲染完成后
   *  走数据树（renderer.renderTree，含收起隐藏子树，2026-09 收起态修复）：按引擎现态收割重建注册表
   *  （打开时引擎 targets 恒空＝文本标记建表；保存后再净化时以引擎 targets 为权威，替换语义）→
   *  直写剥离显示文本（不进命令层，不置脏）→ 按注册表重建连线；
   *  adjust = 打开时 sidecar linkAdjust，重建时一并恢复用户拖过的弯曲（保存后入口不传，引擎现存优先） */
  applyRegistry?(adjust?: LinkAdjust): void
  /** 关联线插件实例（构造时挂载）：建线态入口与状态（验收轮连线文本桥接） */
  associativeLine?: EngineAssociativeLine
  /** 运行中切换布局并即时重排（引擎 index.js:436 setLayout(layout, notRender=false)）；不重挂载画布 */
  setLayout(name: string): void
  /** 运行中切换主题（引擎 index.js:379 setTheme(theme)）：清选中→重绘→view_theme_change；不重挂载画布 */
  setTheme(name: string): void
  /** 容器尺寸变化后重算画布（引擎 index.js:325 resize()；引擎无自动监听，须由宿主在窗口 resize 时调用） */
  resize(): void
  /** 画布尺寸缓存（引擎 index.js:317 getElRectInfo 写入，resize() 的判定基准）。0 = 已被
   *  瞬时 0×0 污染（引擎先写 0 再抛错，MindMapCanvas 0×0 门禁 + focus 自愈所防的态） */
  width: number
  height: number
  /** 整树重渲染（引擎 index.js:308：清节点缓存池+清画布+render）；打开期补注册非精选
   *  图标后触发（iconList 运行时变更不会自动反映到已渲染节点，2026-09 修复）。
   *  引擎包类型未声明（实例运行时存在），故可选——调用点以 ?. 触发 */
  reRender?(callback?: () => void, source?: string): void
  /** 视图变换与复位（引擎 View.js） */
  view: EngineView
  /** 画布容器元素（引擎销毁后为 null） */
  el: HTMLElement | null
  destroy(): void
  renderer?: EngineRenderer
  /** 命令层（构造时同步创建）：撤销历史栈与活动指针（v1.1 撤销/重做接线，见 undoSeed.ts） */
  command?: EngineCommand
  /** 快捷键层（构造时同步创建，KeyCommand.js）：快捷键对调后 Control+c 节点复制在 Control+Shift+c */
  keyCommand?: EngineKeyCommand
}
