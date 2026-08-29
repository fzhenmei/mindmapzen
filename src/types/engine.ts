// src/types/engine.ts —— 引擎节点最小结构类型，避免依赖引擎包类型
import type { ResolvedLink } from '../services/links'

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
   *  内部等待首帧渲染完成后按 links 清空并重建关联线 */
  rebuildLinks?(links: ResolvedLink[]): void
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
