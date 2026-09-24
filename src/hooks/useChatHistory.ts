// src/hooks/useChatHistory.ts —— AI 对话历史接线（2026-09 持久化，EditorView 行数护栏拆出）：
// 打开导图读 sidecar 流水挂 chatStore 待载入（置顶 banner 提醒，UI 归 ChatPanel）；
// 回合收尾落盘端口 = appendTurn(adapter, mdPath) 闭包，错误自兜（console+toast）。
// 2026-09 交互重构：「重新开始」= clearSession + reloadChatHistory（重读全量流水挂回
// pending）——文件是全量流水，重开后载入历史仍可回来（含刚聊的轮次）
import { useCallback, useEffect } from 'react'
import { appendTurn, readChatHistory } from '../services/chatHistory'
import { useChatStore, type ChatMessage } from '../store/chatStore'
import { showToast } from '../services/toast'
import { i18n } from '../i18n'
import type { FsAdapter } from '../types/files'

export interface ChatHistoryPorts {
  /** 回合收尾落盘（ChatPanel persistTurn 接此） */
  persistChatTurn(msgs: ChatMessage[]): Promise<void>
  /** 重读流水挂待载入（ChatPanel 重新开始钮接此）：文件空（无任何轮次）时不动 pending */
  reloadChatHistory(): Promise<void>
}

export function useChatHistory(adapter: FsAdapter, mdPath: string): ChatHistoryPorts {
  // cancelled 守卫：卸载后异读完成不再落 store——切图竞态下陈旧读会污染下一张图的会话
  // （pending 只对当前图有效；切图卸载的 chatStore.reset 先清，陈旧回填等于给新图错挂历史）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const msgs = await readChatHistory(adapter, mdPath)
        if (!cancelled && msgs.length > 0) useChatStore.getState().setPendingHistory(msgs)
      } catch (e) {
        console.warn('读取 AI 对话历史失败（不提醒载入）', e) // readChatHistory 合同不抛，防御兜底
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, mdPath])

  const reloadChatHistory = useCallback(async () => {
    try {
      const msgs = await readChatHistory(adapter, mdPath)
      if (msgs.length > 0) useChatStore.getState().setPendingHistory(msgs)
    } catch (e) {
      console.warn('重读 AI 对话历史失败（不提醒载入）', e) // 同上，防御兜底
    }
  }, [adapter, mdPath])

  // 落盘端口：错误自兜（console+toast），组件侧 void 不再捕
  const persistChatTurn = useCallback(
    async (msgs: ChatMessage[]) => {
      try {
        await appendTurn(adapter, mdPath, msgs)
      } catch (e) {
        console.error('AI 对话记录落盘失败', e)
        showToast(i18n.t('ai.panel.historySaveFailed'))
      }
    },
    [adapter, mdPath],
  )

  return { persistChatTurn, reloadChatHistory }
}
