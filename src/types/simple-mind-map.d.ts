// 引擎无官方 TS 类型（package.json 的 types 字段指向不存在的 ./types/index.d.ts），
// 声明我们用到的 API；多余成员经索引签名访问。假设核验见 docs/notes/engine-api.md。
declare module 'simple-mind-map' {
  import type { EngineNode, EngineRenderer, MindMapHandle } from './engine'
  export default class MindMap implements MindMapHandle {
    constructor(opts: {
      el: HTMLElement
      data?: EngineNode
      /** 引擎布局名（CONSTANTS.LAYOUT 小驼峰值，见 src/editor/layoutMap.ts；未知名引擎静默回退右向） */
      layout?: string
      [k: string]: unknown
    })
    static usePlugin(plugin: unknown, opt?: unknown): void
    on(event: string, cb: (...args: unknown[]) => void): void
    off(event: string, cb: (...args: unknown[]) => void): void
    getData(): EngineNode
    setData(data: EngineNode): void
    execCommand(cmd: string, ...args: unknown[]): void
    /** 运行中切换布局（引擎 index.js:436）：CONSTANTS.LAYOUT 小驼峰值，即时重排不重建实例 */
    setLayout(name: string): void
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
