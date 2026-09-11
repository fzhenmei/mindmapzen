// src/services/ai/lock.ts —— AI 回合锁（spec §6）：回合期间拒绝用户编辑命令，
// AI 工具执行器经 withAiCall 持内部 token 放行——AI 与用户走同一 execCommand 入口
// （共享 sanitize 与撤销栈），仅凭 token 区分来源。
let turnActive = false
let aiCallDepth = 0

export function beginAiTurn(): void {
  turnActive = true
}
export function endAiTurn(): void {
  turnActive = false
}
export function isAiTurnActive(): boolean {
  return turnActive
}

/** AI 内部执行引擎命令的通道：token 作用域内 isUserCommandBlocked 恒 false */
export function withAiCall<T>(fn: () => T): T {
  aiCallDepth++
  try {
    return fn()
  } finally {
    aiCallDepth--
  }
}

/** 回合期间放行的非编辑类命令：点选/清选/全选（画布"只读观光"语义，spec §1）。
 *  白名单外一律拒绝——未来新增命令默认受锁保护，不会漏 */
const TURN_ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  'SET_NODE_ACTIVE',
  'CLEAR_ACTIVE_NODE',
  'SELECT_ALL',
])

export function isUserCommandBlocked(cmd: string): boolean {
  if (!turnActive || aiCallDepth > 0) return false
  return !TURN_ALLOWED_COMMANDS.has(cmd)
}
