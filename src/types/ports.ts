// src/types/ports.ts —— 环境端口类型（生产为 Tauri，测试注入桩）

/** 窗口关闭请求事件的最小面：preventClose 阻止本次窗口关闭（Tauri CloseRequestedEvent.preventDefault 的适配） */
export type CloseGuardEvent = { preventClose(): void }

/** 关闭守卫注册端口：注册 handler（返回反注册函数，需幂等）；生产为 Tauri onCloseRequested */
export type RegisterCloseGuard = (handler: (e: CloseGuardEvent) => void) => () => void

/** 导出与复制图片端口（M5b Task 5）：生产为 Tauri save 对话框 + clipboard-manager writeImage；
 *  测试注入记录桩，E2E web 模式记录到 harness（__zenE2e.savePaths/exportedBytes） */
export interface ExportPorts {
  /** 保存路径选择：defaultName 为默认文件名（含扩展）；用户取消返回 null */
  pickSavePath(defaultName: string): Promise<string | null>
  /** 图片写入系统剪贴板（plugin-clipboard-manager writeImage 收 Uint8Array） */
  writeImage(bytes: Uint8Array): Promise<void>
  /** Edge 无头打印出 PDF（2026-09-23 导出 PDF）：生产为 Tauri export_pdf_via_edge；
   *  测试注入桩，E2E web 模式记录到 harness（__zenE2e.edgePrints） */
  runEdgePrint(html: string, pdfPath: string): Promise<void>
  /** 原生是/否问询（2026-09-23 导出后打开）：生产为 Tauri dialog ask;测试注入桩，
   *  E2E web 模式记录到 harness（__zenE2e.exportAsks）并默认答否（不阻塞既有用例） */
  ask(message: string, title: string): Promise<boolean>
  /** 系统默认程序打开文件（2026-09-23 导出后打开）：生产为 Tauri opener openPath；
   *  测试注入桩，E2E web 模式记录到 harness（__zenE2e.openedPaths） */
  openExported(path: string): Promise<void>
}

/** git 命令端口（M20 版本管理）：生产为 Tauri git_exec（cwd 限定工作区），
 *  测试注入记录桩（断言命令序列与决策） */
export type GitRun = (
  cwd: string,
  args: readonly string[],
) => Promise<{ ok: boolean; out: string; err: string }>

/** git 克隆端口（「从 Git 库打开」）：生产为 Tauri git_clone（cwd 为目标父目录，
 *  在其下克隆出 <repo_name>/；超时 600s 在 Rust 侧，不受 git_exec 30s 常规预算约束），
 *  测试注入记录桩。返回结构与 GitRun 同构 */
export type GitClone = (
  parentDir: string,
  url: string,
  repoName: string,
) => Promise<{ ok: boolean; out: string; err: string }>
