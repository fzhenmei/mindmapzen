// src/components/ChatPanel.tsx —— AI 对话面板（spec §7）：纯装配 + 回合编排（send/stop）。
// 流式中纯文本+光标，定稿切 MarkdownPreview（复用既有管线零新依赖）。
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send, Square } from 'lucide-react'
import MarkdownPreview from './MarkdownPreview'
import SplitResizer from './SplitResizer'
import { cn } from '../lib/utils'
import { i18n } from '../i18n'
import { useAppStore } from '../store/appStore'
import { useChatStore, type ChatMessage } from '../store/chatStore'
import { beginAiTurn, endAiTurn, withAiCall } from '../services/ai/lock'
import { buildSystemPrompt, selectionLine } from '../services/ai/prompt'
import { executeAiTool } from '../services/ai/tools'
import { getTransport } from '../services/ai/client'
import { createTurnStop, runUserTurn } from '../services/ai/agentLoop'
import type { MindMapHandle } from '../types/engine'

export const AI_PANEL_DEFAULT_PX = 320

/** 输入框拖高下限（≈默认两行）。上限拖时按面板实际高算（60%），并兜底 min+40：
 *  jsdom clientHeight=0、极小窗口面板过矮时，输入框至少还能向上扩 40px */
const AI_INPUT_MIN_PX = 64

interface Props {
  mmRef: RefObject<MindMapHandle | null>
  selection: { uid: string; text: string } | null
  width: number
  onResize(w: number): void // 拖拽中每帧（内存态）
  onCommit(w: number): void // 松手落盘
  onReset(): void // 双击回默认宽
  onClose(): void
}

export default function ChatPanel({ mmRef, selection, width, onResize, onCommit, onReset, onClose }: Readonly<Props>) {
  const { t } = useTranslation()
  const messages = useChatStore((s) => s.messages)
  const phase = useChatStore((s) => s.phase)
  const contextNode = useChatStore((s) => s.contextNode)
  const [input, setInput] = useState('')
  // 输入框拖高（2026-09 长内容）：层级同面板宽（aiDragPx ?? aiChatWidth 先例），
  // 但松手不清暂存——持久层异步落盘窗口期清了会闪回（见 InputResizer onCommit 注释），
  // 暂存保持到同值落地；null = 默认两行（rows=2 自然高）
  const savedInputH = useAppStore((s) => s.aiChatInputHeight)
  const setSavedInputH = useAppStore((s) => s.setAiChatInputHeight)
  const [inputDragPx, setInputDragPx] = useState<number | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const inputH = inputDragPx ?? savedInputH ?? null

  // v1.1（2026-09-13）：卸载即中止回合——关面板 = 不再需要，防后台孤儿回合继续编辑导图
  // （用户失去观察入口却不知情）。走全局句柄（终审 I2/I3 架构不废，正是它让卸载 cleanup
  // 不依赖组件 ref）：idle 时句柄为 null 安全 no-op；切图路径无交集（回合中切图本就被拦）
  useEffect(() => () => { useChatStore.getState().stopRequest?.() }, [])

  /** Enter 发送 / Shift+Enter 换行（2026-09 输入优化）：无 Shift 的 Enter 拦下走发送，
   *  Shift+Enter 放行走原生换行；合成中放行——中文输入法选词的确认回车 isComposing=true，
   *  拦了会吞候选确认。流式中 handleSend 自带 phase 守卫，Enter 天然 no-op（彼时发送位已是停止钮） */
  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void handleSend()
  }

  async function handleSend(e?: SubmitEvent): Promise<void> {
    e?.preventDefault()
    const text = input.trim()
    const chat = useChatStore.getState()
    if (!text || chat.phase !== 'idle') return
    const ai = useAppStore.getState().aiConfig
    if (!ai.baseUrl || !ai.apiKey || !ai.model) {
      chat.pushError(i18n.t('ai.error.notConfigured'))
      return
    }
    const mm = mmRef.current
    if (!mm) {
      // 引擎未就绪不再无声失败（终审三叉#2）：return 前给显式出口——错误卡指引重试
      chat.pushError(i18n.t('ai.turn.engineNotReady'))
      return
    }
    setInput('')
    // v1.1 ②：git 备份未启用（默认）且本会话未告知——首轮发送前插安全网信息卡（出现在
    // 用户消息上方）。纯指路（案头 → 设置 → 版本管理）不做面板内开关：设置已有入口避免重复
    const appNow = useAppStore.getState()
    if (!appNow.gitConfig.enabled && !appNow.aiBackupNoticeShown) {
      appNow.markAiBackupNoticeShown()
      chat.pushNotice(i18n.t('ai.notice.noBackup'))
    }
    // 对话历史只回传 user/assistant 文本（工具明细不回传，省 token；卡片留在 UI）；
    // 先取历史再 pushUser——runUserTurn 自会追加本轮 userText，取晚一步会把当前消息重复上送
    const history = useChatStore
      .getState()
      .messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && m.rendered && m.text))
      .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }))
    chat.pushUser(text)
    const sel = selectionLine(contextNode ?? selection)
    // 尾部斜杠循环剥除（Sonar S8786 只认单量词正则，/\/+$/ 亦被报——循行尾重复标记先例改循环）
    let base = ai.baseUrl
    while (base.endsWith('/')) base = base.slice(0, -1)
    const url = `${base}/chat/completions`
    beginAiTurn()
    const stop = createTurnStop()
    // transport 每回合新实例（Task 8 契约：实例不可跨回合复用/并发）
    const transport = getTransport()
    // 停止句柄挂 store（终审 I3）：回合中 ai-close 卸载重开后新组件实例 ref 归零，
    // 停止钮会 no-op（孤儿回合失控）——闭包同时持有 stop 与 transport，重开面板也能
    // 停掉在途回合。除 stop.request 外直接 abort transport（终审 I2）：模型停摆（无
    // 后续 delta）时 abort 传染不触发，不主动掐流就要挂到 Rust 空闲超时 120s 才收尾
    useChatStore.getState().setStopRequest(() => {
      stop.request()
      transport.abort()
    })
    try {
      await runUserTurn(
        {
          transport,
          buildMessages: (msgs) => [
            { role: 'system', content: buildSystemPrompt(mm.renderer?.renderTree ?? null) },
            ...msgs,
          ],
          executeTool: (name, args) => Promise.resolve(executeAiTool(mm, name, args, withAiCall)),
          backupBeforeFirstEdit: async () => {
            await useAppStore.getState().backupNow()
          },
          on: {
            phase: (p) => {
              const chat = useChatStore.getState()
              chat.setPhase(p)
              // 工具轮 round-2 回到 streaming 时把已定稿消息退回流式分支（终审 M3）：
              // delta 继续纯文本+光标追加，不再每 delta 一次全量 lute 重渲染，定稿再挂 md
              if (p === 'streaming') chat.unrenderLastAssistant()
            },
            delta: (d) => useChatStore.getState().appendStreamDelta(d),
            finalize: () => useChatStore.getState().finalizeStream(),
            card: (c) => useChatStore.getState().pushCard(c),
            error: (msg) => useChatStore.getState().pushError(msg),
          },
        },
        stop,
        { url, apiKey: ai.apiKey, model: ai.model, history, userText: text, selection: sel },
      )
    } catch (err) {
      // 编排入口兜底出口（吞异常红线）：任何未预期异常落错误卡片
      console.error('AI 回合异常', err)
      useChatStore.getState().pushError(err instanceof Error ? err.message : String(err))
    } finally {
      useChatStore.getState().finalizeStream() // 停止/异常路径也定稿半截消息
      useChatStore.getState().setPhase('idle')
      endAiTurn()
      useChatStore.getState().setStopRequest(null) // 回合收尾即摘除全局停止句柄
    }
  }

  return (
    <aside
      ref={panelRef}
      data-testid="ai-panel"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border border-border bg-background"
    >
      <SplitResizer side="left" width={width} min={240} max={520} label={t('ai.panel.title')} onResize={onResize} onCommit={onCommit} onReset={onReset} />
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">{t('ai.panel.title')}</span>
        <button type="button" data-testid="ai-close" aria-label={t('ai.panel.close')} onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
          <X className="size-4" />
        </button>
      </header>
      <div data-testid="ai-messages" className="flex-1 overflow-y-auto p-3 text-sm">
        {messages.length === 0 ? (
          <div className="mt-8 space-y-1 text-center text-muted-foreground">
            <p className="font-medium text-foreground">{t('ai.panel.emptyTitle')}</p>
            <p className="text-xs">{t('ai.panel.emptyBody')}</p>
          </div>
        ) : (
          messages.map((m, i) => <MessageRow key={m.id} msg={m} idx={i} />)
        )}
      </div>
      {(contextNode ?? selection) && (
        <p className="shrink-0 truncate border-t border-border px-3 py-1.5 text-xs text-muted-foreground" data-testid="ai-context-chip">
          {t('ai.panel.contextChip', { text: (contextNode ?? selection)!.text })}
        </p>
      )}
      {/* 输入区（2026-09 长内容输入）：上缘拖高手柄 + 表单 + 快捷键常显提示；
          border-t 上移到容器（form 原自带），消息区 flex-1 自动让位。
          手柄 onCommit 不清拖拽暂存：持久层异步落盘（load-merge-save 磁盘 IO）窗口期内
          清了会闪回默认两行、落地后又跳回拖拽高——暂存保持到同值落地无感，双击重置才清 */}
      <div className="shrink-0 border-t border-border" data-testid="ai-input-area">
        <InputResizer
          label={t('ai.panel.resizeInput')}
          title={t('ai.panel.inputResizeTitle')}
          min={AI_INPUT_MIN_PX}
          startOf={() => taRef.current?.clientHeight ?? AI_INPUT_MIN_PX}
          maxOf={() =>
            Math.max(AI_INPUT_MIN_PX + 40, Math.round((panelRef.current?.clientHeight ?? 0) * 0.6))
          }
          onResize={setInputDragPx}
          onCommit={(h) => void setSavedInputH(h)}
          onReset={() => {
            setInputDragPx(null)
            void setSavedInputH(null)
          }}
        />
        <form onSubmit={(e) => void handleSend(e)} className="flex items-end gap-2 p-2">
          <textarea
            ref={taRef}
            data-testid="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t('ai.panel.placeholder')}
            rows={2}
            style={inputH === null ? undefined : { height: inputH }}
            className="min-w-0 flex-1 resize-none rounded-md border border-border bg-transparent p-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
          {phase === 'idle' ? (
            <button type="submit" data-testid="ai-send" aria-label={t('ai.panel.send')} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
              <Send className="size-4" />
            </button>
          ) : (
            <button type="button" data-testid="ai-stop" aria-label={t('ai.panel.stop')} onClick={handleStop} className="rounded-md bg-destructive p-2 text-destructive-foreground">
              <Square className="size-4" />
            </button>
          )}
        </form>
        <p data-testid="ai-input-hint" className="select-none px-3 pb-1.5 text-right text-[10px] text-muted-foreground">
          {t('ai.panel.inputHint')}
        </p>
      </div>
    </aside>
  )
}

/** 全局停止句柄（终审 I2/I3）：不依赖组件实例 ref——回合中 ai-close 卸载重开后
 *  新实例仍可停掉进行中回合；句柄内同时 stop.request + transport.abort（模型停摆
 *  时 abort 传染不触发，主动掐流不等 Rust 空闲超时 120s） */
function handleStop(): void {
  useChatStore.getState().stopRequest?.()
}

function MessageRow({ msg, idx }: Readonly<{ msg: ChatMessage; idx: number }>) {
  if (msg.role === 'user') {
    return (
      <div className="mb-2 flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-accent px-2.5 py-1.5" data-testid="ai-msg-user">{msg.text}</p>
      </div>
    )
  }
  if (msg.role === 'error') {
    return <p className="mb-2 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs text-destructive" data-testid="ai-msg-error">{msg.text}</p>
  }
  if (msg.role === 'notice') {
    // 中性信息卡（v1.1 ② 安全网告知）：muted 全不透明底——半透明底深浅主题混叠看不清
    return <p className="mb-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs text-muted-foreground" data-testid="ai-msg-notice">{msg.text}</p>
  }
  return (
    <div className="mb-3">
      {msg.rendered ? (
        <div className="prose prose-sm max-w-none" data-testid="ai-msg-md">
          <MarkdownPreview text={msg.text} />
        </div>
      ) : (
        <p className="whitespace-pre-wrap" data-testid="ai-msg-streaming">
          {msg.text}
          <span className="animate-pulse">▍</span>
        </p>
      )}
      {/* 卡片 append-only 无删除重排（chatStore.pushCard 只追加），内容复合键即稳定标识 */}
      {(msg.cards ?? []).map((c, i) => (
        <p
          key={`${c.kind}-${c.ok}-${i}`}
          data-testid={`ai-card-${idx}-${i}`}
          className={`mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${c.ok ? 'border-border text-muted-foreground' : 'border-destructive/40 text-destructive'}`}
        >
          {/* spec §7「成功绿/失败红」：成功仅 ✓ 图标着绿（克制处理，正文保持 muted）；失败整卡红 */}
          {c.ok ? <span className="text-emerald-600 dark:text-emerald-400">✓</span> : '✕'} {cardText(c)}
        </p>
      ))}
    </div>
  )
}

/** 卡片文案 key 映射（t() key 类型收紧至字面量集，动态拼串不可入参；未知 kind 回退工具原文） */
const CARD_LABEL_KEYS = { add: 'ai.card.add', update: 'ai.card.update', remove: 'ai.card.remove', move: 'ai.card.move' } as const

function cardText(c: { kind: string; ok: boolean; text: string }): string {
  const key = CARD_LABEL_KEYS[c.kind as keyof typeof CARD_LABEL_KEYS]
  const label = key === undefined ? c.text : i18n.t(key, { text: c.text })
  return c.ok ? label : `${label}${i18n.t('ai.card.failed')}`
}

/** 输入区上缘拖高手柄（2026-09 长内容输入）：向上拖增高/向下拖回落，双击回默认两行。
 *  机制同 SplitResizer（Pointer Events + setPointerCapture + window 兜底监听）但方向垂直；
 *  起点高/上限高拖时实测——默认两行时无数值基准，读 textarea 实际 clientHeight；上限取
 *  面板实际高的 60%（随窗口变）。html 挂 data-row-resizing：App.css 禁过渡/锁选择/
 *  row-resize 光标 + 指示线常亮（data-split-resizing 写死 col-resize，复用会显反光标） */
function InputResizer({ label, title, min, startOf, maxOf, onResize, onCommit, onReset }: Readonly<{
  label: string
  title: string
  min: number
  startOf(): number
  maxOf(): number
  onResize(h: number): void
  onCommit(h: number): void
  onReset(): void
}>) {
  const onPointerDown = (e: ReactPointerEvent<HTMLHRElement>) => {
    if (e.button !== 0) return
    const pid = e.pointerId
    const d = { startY: e.clientY, startH: startOf(), last: min, moved: false }
    const max = maxOf()
    try {
      e.currentTarget.setPointerCapture(pid)
    } catch {
      // jsdom 无 setPointerCapture 实现；window 兜底监听仍在（同 SplitResizer）
    }
    document.documentElement.dataset.rowResizing = ''
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return
      // 上移（clientY 减小）为增量：拖上增高、拖下回落
      d.last = Math.round(Math.min(max, Math.max(min, d.startH + (d.startY - ev.clientY))))
      d.moved = true
      onResize(d.last)
    }
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      delete document.documentElement.dataset.rowResizing
      if (d.moved) onCommit(d.last) // 纯点击不提交，双击路径留给 onReset（同 SplitResizer）
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }
  return (
    <hr
      aria-orientation="horizontal"
      aria-label={label}
      data-testid="ai-input-resizer"
      title={title}
      className={cn(
        'input-resizer relative h-2 w-full cursor-row-resize touch-none border-0',
        // 横向指示线（after）左右各缩 20px，hover 浮现；拖拽中 App.css 常亮
        'after:absolute after:left-5 after:right-5 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:rounded-full after:bg-border after:opacity-0 after:transition-opacity hover:after:opacity-100',
      )}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
    />
  )
}
