// src/hooks/useChatHistory.ts —— AI 对话历史接线（2026-09 持久化，EditorView 行数护栏拆出）：
// 打开导图读 sidecar 流水挂 chatStore 待载入（置顶 banner 提醒载入/重新开始，UI 归 ChatPanel）；
// 回合收尾落盘端口 = appendTurn(adapter, mdPath) 闭包，错误自兜（console+toast）
import { useCallback, useEffect } from 'react'
import { appendTurn, readChatHistory } from '../services/chatHistory'
import { useChatStore, type ChatMessage } from '../store/chatStore'
import { showToast } from '../services/toast'
import { i18n } from '../i18n'
import type { FsAdapter } from '../types/files'

/** 挂载读流水 + 返回回合收尾落盘端口（ChatPanel persistTurn 接此） */
export function useChatHistory(adapter: FsAdapter, mdPath: string): (msgs: ChatMessage[]) => Promise<void> {
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

  // 落盘端口：错误自兜（console+toast），组件侧 void 不再捕
  return useCallback(
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
}
