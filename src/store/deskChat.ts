// src/store/deskChat.ts —— 案头 AI 面板会话仓（spec §2.1）：工厂第二实例。
// 与编辑器会话完全隔离；切工作区 reset（DeskAiPanel 的 workspaceDir effect）。
import { createChatStore } from './chatStore'

export const useDeskChatStore = createChatStore()
export type { ChatMessage } from './chatStore'
