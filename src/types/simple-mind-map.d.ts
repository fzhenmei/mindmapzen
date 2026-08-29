// 引擎无官方 TS 类型（package.json 的 types 字段指向不存在的 ./types/index.d.ts），
// 声明我们用到的 API；多余成员经索引签名访问。假设核验见 docs/notes/engine-api.md。
declare module 'simple-mind-map' {
  import type { EngineNode, EngineRenderer, EngineView, MindMapHandle } from './engine'
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
