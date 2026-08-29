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
  /** 引擎文本编辑框：关闭并提交框内当前内容（引擎 TextEdit.js:475）；未打开时为无害空操作 */
  textEdit: { hideEditTextBox(): void }
  /** 改节点数据后按需重渲（引擎 Render.js:1997）：node.reRender() 重建内容，尺寸变化时全图重排。
   *  裸 SET_NODE_DATA 不重渲染（M5b 核验 13），备注角标增删后须补调 */
  reRenderNodeCheckChange(node: unknown, notRender?: boolean): void
  /** 渲染树根节点实例（Render.js:601）；未渲染时为 null */
  root?: NodeBox | null
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

export interface MindMapHandle {
  getData(): EngineNode
  execCommand(cmd: string, ...args: unknown[]): void
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
   *  走渲染树：按引擎现态收割重建注册表（打开时引擎 targets 恒空＝文本标记建表；保存后再净化时
   *  以引擎 targets 为权威，替换语义）→ 直写剥离显示文本（不进命令层，不置脏）→ 按注册表重建连线；
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
  /** 视图变换与复位（引擎 View.js） */
  view: EngineView
  /** 画布容器元素（引擎销毁后为 null） */
  el: HTMLElement | null
  destroy(): void
  renderer?: EngineRenderer
}
