// src/components/DeskAiPanel.tsx —— 案头 AI 文件整理面板（spec §2.4）：右缘竖条入口 +
// 参数化 ChatPanel 组装（desk 第二实例 + 文件工具 + 工作区级历史）；人工确认门（§1.5）
// 的 gate 在此持有——onUserMessage 确认词置位、phase 回 idle 重置（纵深防御）。
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import ChatPanel from './ChatPanel'
import { useAppStore } from '../store/appStore'
import { useDeskChatStore } from '../store/deskChat'
import { useDeskChatHistory } from '../hooks/useDeskChatHistory'
import { buildDeskSystemPrompt } from '../services/ai/prompt'
import { executeFileTool, AI_FILE_TOOL_SCHEMAS, type FileToolEnv } from '../services/ai/toolsFiles'
import type { ToolCallResult } from '../services/ai/tools'
import type { WriteClipboard } from '../services/clipboard'

/** 确认词（spec §1.5）：大小写不敏感包含匹配；trim 后 ≤12 字符才检测——长消息视为
 *  新指令/讨论（如「嗯，但是我再想想要不要把 A 也移过去」是犹豫不是确认） */
const CONFIRM_WORDS = ['确认', 'ok', 'okay', '好的', '好', '可以', '同意', '执行', '行', '嗯', 'yes', '没问题', '开始']
const CONFIRM_MAX_LEN = 12

/** 否定词（2026-09-25 裁定）：先于确认词判定——「不行」「不可以」含单字确认词会误开门 */
const REJECT_WORDS = ['不行', '不可以', '不好', '不用', '先不', '暂不', '别', '算了', '取消', '再想想', '等等', '等一下']

function isConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length > CONFIRM_MAX_LEN || t === '') return false
  if (REJECT_WORDS.some((w) => t.includes(w))) return false
  return CONFIRM_WORDS.some((w) => t.includes(w))
}

interface Props {
  /** 建目录/移动后刷新左树（LibraryView 的 reloadTree） */
  onTreeChanged(): Promise<void>
  writeClipboard: WriteClipboard
}

export default function DeskAiPanel({ onTreeChanged, writeClipboard }: Readonly<Props>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(360)
  const aiConfigured = useAppStore((s) => {
    const a = s.aiConfig
    return a.baseUrl !== '' && a.apiKey !== '' && a.model !== ''
  })
  const adapter = useAppStore((s) => s.adapter)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const { persistChatTurn, reloadChatHistory } = useDeskChatHistory(adapter, workspaceDir)
  // 确认门状态（回合级）：最新用户消息为确认词 → 当轮放行写工具；回合结束重置
  const gateRef = useRef({ confirmed: false })

  // phase 回 idle 重置（纵深防御——onUserMessage 已按最新消息置位/清位）
  useEffect(() => {
    const unsub = useDeskChatStore.subscribe((s, prev) => {
      if (s.phase === 'idle' && prev.phase !== 'idle') gateRef.current.confirmed = false
    })
    return unsub
  }, [])

  if (!aiConfigured) return null

  /** 工具执行时实时取工作区（防面板开着期间切换工作区后 env 陈旧）；ws 为空 = 工作区未就绪 */
  const executeTool = (name: string, args: unknown): Promise<ToolCallResult> => {
    const { adapter: a, workspaceDir: ws } = useAppStore.getState()
    if (a === null || ws === null) return Promise.resolve({ ok: false, detail: '工作区未就绪' })
    const env: FileToolEnv = {
      adapter: a,
      wsDir: ws,
      onFileRelocated: async (from, to) => {
        // 宿主回调自兜（toolsFiles「失败不抛异常」契约）：文件已搬移成功后，路径态换址/
        // 刷新抛错不能冒泡破坏工具结果——留 console.warn 线索即可
        try {
          await useAppStore.getState().relocateMapPath(from, to)
          await useAppStore.getState().refreshMaps()
          await onTreeChanged()
        } catch (e) {
          console.warn('AI 整理后路径态换址/刷新失败（文件已移动，不影响结果）', e)
        }
      },
      onTreeChanged: async () => {
        // 同上自兜：目录已创建成功，左树刷新失败不冒泡成工具失败
        try {
          await onTreeChanged()
        } catch (e) {
          console.warn('AI 建目录后左树刷新失败（目录已创建，不影响结果）', e)
        }
      },
      confirmation: { isConfirmed: () => gateRef.current.confirmed },
    }
    return executeFileTool(name, args, env)
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          data-testid="desk-ai-toggle"
          aria-label={t('ai.desk.toggle')}
          title={t('ai.desk.toggle')}
          onClick={() => setOpen(true)}
          className="fixed top-8 bottom-0 right-0 z-30 my-auto flex h-12 w-6 items-center justify-center rounded-l-lg border border-r-0 border-sidebar-border bg-background shadow-md hover:bg-accent"
        >
          <Sparkles className="size-3.5 text-muted-foreground" />
        </button>
      )}
      {open && (
        <div className="fixed top-[5px] right-[5px] bottom-[5px] z-30 flex" style={{ width }}>
          <ChatPanel
            deps={{
              store: useDeskChatStore,
              texts: {
                title: t('ai.desk.title'),
                placeholder: t('ai.desk.placeholder'),
                emptyTitle: t('ai.desk.emptyTitle'),
                emptyBody: t('ai.desk.emptyBody'),
              },
              buildPrompt: buildDeskSystemPrompt,
              buildSelectionLine: () => null,
              preSendGuard: () => null,
              executeTool,
              toolSchemas: [...AI_FILE_TOOL_SCHEMAS],
              onUserMessage: (text) => {
                gateRef.current.confirmed = isConfirmation(text)
              },
            }}
            selection={null}
            width={width}
            writeClipboard={writeClipboard}
            onResize={setWidth}
            onCommit={() => {}}
            onReset={() => setWidth(360)}
            onClose={() => setOpen(false)}
            persistTurn={persistChatTurn}
            reloadHistory={reloadChatHistory}
          />
        </div>
      )}
    </>
  )
}
