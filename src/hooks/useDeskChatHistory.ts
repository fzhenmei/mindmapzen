// src/hooks/useDeskChatHistory.ts —— 案头 AI 对话历史接线（spec §1.2）：路径 = 工作区根
// .zen.desk-chat.json（At 版直用，不走 .md 后缀规则）；切工作区 reset + 重读（对齐编辑器
// 切图语义）；落盘端口自兜（console+toast），组件侧 void 不再捕
import { useCallback, useEffect } from 'react'
import { appendTurnAt, readChatHistoryAt } from '../services/chatHistory'
import { useDeskChatStore, type ChatMessage } from '../store/deskChat'
import { showToast } from '../services/toast'
import { i18n } from '../i18n'
import type { FsAdapter } from '../types/files'
import { joinPath } from '../services/workspace'

export function deskChatHistoryPath(wsDir: string): string {
  return joinPath(wsDir, '.zen.desk-chat.json')
}

export function useDeskChatHistory(adapter: FsAdapter, workspaceDir: string | null) {
  useEffect(() => {
    // 切工作区 = 新会话：reset 后重读新工作区流水（cancelled 守卫同 useChatHistory）
    useDeskChatStore.getState().reset()
    if (workspaceDir === null) return
    let cancelled = false
    void (async () => {
      try {
        const msgs = await readChatHistoryAt(adapter, deskChatHistoryPath(workspaceDir))
        if (!cancelled && msgs.length > 0) useDeskChatStore.getState().setPendingHistory(msgs)
      } catch (e) {
        console.warn('读取案头 AI 对话历史失败（不提醒载入）', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, workspaceDir])

  const reloadChatHistory = useCallback(async () => {
    if (workspaceDir === null) return
    try {
      const msgs = await readChatHistoryAt(adapter, deskChatHistoryPath(workspaceDir))
      if (msgs.length > 0) useDeskChatStore.getState().setPendingHistory(msgs)
    } catch (e) {
      console.warn('重读案头 AI 对话历史失败（不提醒载入）', e)
    }
  }, [adapter, workspaceDir])

  const persistChatTurn = useCallback(
    async (msgs: ChatMessage[]) => {
      if (workspaceDir === null) return
      try {
        await appendTurnAt(adapter, deskChatHistoryPath(workspaceDir), msgs)
      } catch (e) {
        console.error('案头 AI 对话记录落盘失败', e)
        showToast(i18n.t('ai.panel.historySaveFailed'))
      }
    },
    [adapter, workspaceDir],
  )

  return { persistChatTurn, reloadChatHistory }
}
