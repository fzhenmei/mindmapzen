// 引擎无官方 TS 类型（package.json 的 types 字段指向不存在的 ./types/index.d.ts），
// 声明我们用到的 API；多余成员经索引签名访问。假设核验见 docs/notes/engine-api.md。
declare module 'simple-mind-map' {
  import type { EngineKeyCommand, EngineNode, EngineRenderer, EngineView, MindMapHandle } from './engine'
  export default class MindMap implements MindMapHandle {
    constructor(opts: {
      el: HTMLElement
      data?: EngineNode
      /** 引擎布局名（CONSTANTS.LAYOUT 小驼峰值，见 src/editor/layoutMap.ts；未知名引擎静默回退右向） */
      layout?: string
      /** 引擎主题名（须先经 defineTheme 注册；未注册名引擎静默回退 default 主题，见 engine-api.md「M4 核验」(11)） */
      theme?: string
      [k: string]: unknown
    })
    static usePlugin(plugin: unknown, opt?: unknown): void
    /** 注册命名主题到模块级主题表（纯静态，无 DOM；同名已存在时返回 Error 而非抛出，幂等语义由调用方守卫保证） */
    static defineTheme(name: string, config: Record<string, unknown>): void
    on(event: string, cb: (...args: unknown[]) => void): void
    off(event: string, cb: (...args: unknown[]) => void): void
    getData(): EngineNode
    setData(data: EngineNode): void
    execCommand(cmd: string, ...args: unknown[]): void
    /** 运行中切换布局（引擎 index.js:436）：CONSTANTS.LAYOUT 小驼峰值，即时重排不重建实例 */
    setLayout(name: string): void
    /** 运行中切换主题（引擎 index.js:379-386）：清选中→重绘（CHANGE_THEME）→emit view_theme_change，不重挂载 */
    setTheme(name: string): void
    /** 容器尺寸变化后重算画布（引擎 index.js:325）：无自动监听，宿主须在窗口 resize 时调用 */
    resize(): void
    /** 视图变换与复位（引擎 View.js）：x/y/scale 可直接赋值，改后调 transform() 生效 */
    view: EngineView
    /** 画布容器元素（destroy 后为 null） */
    el: HTMLElement | null
    destroy(): void
    /** 引擎构造时同步创建（index.js:136 new Render）；节点实例定位与编辑框控制走这里 */
    renderer: EngineRenderer;
    /** 快捷键层（构造时同步创建 new KeyCommand，window keydown 全局注册） */
    keyCommand: EngineKeyCommand;
    [key: string]: unknown
  }
}

declare module 'simple-mind-map/src/plugins/Drag.js' {
  const Drag: unknown
  export default Drag
}

declare module 'simple-mind-map/src/plugins/AssociativeLine.js' {
  const AssociativeLine: unknown
  export default AssociativeLine
}

declare module 'simple-mind-map/src/plugins/Export.js' {
  const Export: unknown
  export default Export
}

// 框选多选插件（2026-09 圈选）：instanceName 'select'（Select.js:237），默认选项下空白处
// Ctrl/Cmd+左键拖拽或裸右键拖拽画选框，框内节点动态进出 activeNodeList（300ms 节流命中测试）；
// 核验见 docs/notes/engine-api.md「圈选核验」
declare module 'simple-mind-map/src/plugins/Select.js' {
  const Select: unknown
  export default Select
}

// 方向键导航插件（M12a Task 3）：instanceName 'keyboardNavigation'（KeyboardNavigation.js:285），
// 注册 Left/Up/Right/Down 快捷键按几何最近移动选中；核验见 docs/notes/engine-api.md「v1.2 核验」
declare module 'simple-mind-map/src/plugins/KeyboardNavigation.js' {
  const KeyboardNavigation: unknown
  export default KeyboardNavigation
}

// 关联线几何工具（M5d Task 5 弯曲记忆）：节点实例须带布局后几何字段（left/top/width/height）。
// Point = 端点/控制点坐标 {x,y,dir?,range?}；算法核验见 docs/notes/engine-api.md「M5d 核验 (d)」
declare module 'simple-mind-map/src/plugins/associativeLine/associativeLineUtils.js' {
  export interface AssociativeLinePoint {
    x: number
    y: number
    dir?: string
    range?: number
  }
  /** 按两节点几何定连线起/终点（AssociativeLine.computeNodePoints，utils.js:210） */
  export function computeNodePoints(from: unknown, to: unknown): [AssociativeLinePoint, AssociativeLinePoint]
  /** 默认贝塞尔控制点（S 曲线，utils.js:11） */
  export function computeCubicBezierPathPoints(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): [AssociativeLinePoint, AssociativeLinePoint]
}
