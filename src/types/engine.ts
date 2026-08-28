// src/types/engine.ts —— 引擎节点最小结构类型，避免依赖引擎包类型
export interface EngineNode {
  data: { text: string; expand?: boolean; [k: string]: unknown }
  children?: EngineNode[]
}
export interface MindMapHandle {
  getData(): EngineNode
  execCommand(cmd: string, ...args: unknown[]): void
  destroy(): void
}
