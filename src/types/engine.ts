// src/types/engine.ts —— 引擎节点最小结构类型，避免依赖引擎包类型
export interface EngineNode {
  data: { text: string; expand?: boolean; [k: string]: unknown }
  children?: EngineNode[]
}
/** 引擎渲染器（MindMapHandle.renderer）：本项目用到的两个成员，核验见 docs/notes/engine-api.md「M3 核验」 */
export interface EngineRenderer {
  /** 按节点 uid 查渲染树节点实例（引擎 Render.js:2094）；未命中返回 null/undefined */
  findNodeByUid(uid: string): unknown
  /** 引擎文本编辑框：关闭并提交框内当前内容（引擎 TextEdit.js:475）；未打开时为无害空操作 */
  textEdit: { hideEditTextBox(): void }
}

export interface MindMapHandle {
  getData(): EngineNode
  execCommand(cmd: string, ...args: unknown[]): void
  /** 运行中切换布局并即时重排（引擎 index.js:436 setLayout(layout, notRender=false)）；不重挂载画布 */
  setLayout(name: string): void
  /** 容器尺寸变化后重算画布（引擎 index.js:325 resize()；引擎无自动监听，须由宿主在窗口 resize 时调用） */
  resize(): void
  /** 视图复位：缩放回 1:1 并回到中心（引擎 View.js reset()） */
  view: { reset(): void }
  destroy(): void
  renderer?: EngineRenderer
}
