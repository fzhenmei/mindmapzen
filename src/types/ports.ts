// src/types/ports.ts —— 环境端口类型（生产为 Tauri，测试注入桩）

/** 窗口关闭请求事件的最小面：preventClose 阻止本次窗口关闭（Tauri CloseRequestedEvent.preventDefault 的适配） */
export type CloseGuardEvent = { preventClose(): void }

/** 关闭守卫注册端口：注册 handler（返回反注册函数，需幂等）；生产为 Tauri onCloseRequested */
export type RegisterCloseGuard = (handler: (e: CloseGuardEvent) => void) => () => void
