// src/components/ChatPanel.tsx —— AI 对话面板（spec §7）：纯装配 + 回合编排（send/stop）。
// 流式中纯文本+光标，定稿切 MarkdownPreview（复用既有管线零新依赖）。
// 参数化（2026-09 案头文件域）：引擎/会话耦合全部下沉 deps 注入（store/prompt/工具执行/
// 守卫/确认回调/工具清单）——编辑器挂载处传原值，行为零变化；面板本体与宿主域解耦。
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send, Square, Copy, Check, ChevronRight, LoaderCircle, RotateCcw } from 'lucide-react'
import MarkdownPreview from './MarkdownPreview'
import SplitResizer from './SplitResizer'
import { cn } from '../lib/utils'
import { i18n } from '../i18n'
import { showToast } from '../services/toast'
import type { WriteClipboard } from '../services/clipboard'
import { useAppStore } from '../store/appStore'
import { CARDS_WINDOW, type ChatMessage, type ChatStore } from '../store/chatStore'
import { windowedHistory } from '../services/chatHistory'
import { beginAiTurn, endAiTurn } from '../services/ai/lock'
import type { ToolCallResult } from '../services/ai/tools'
import { getTransport } from '../services/ai/client'
import { createTurnStop, runUserTurn } from '../services/ai/agentLoop'

export const AI_PANEL_DEFAULT_PX = 320

/** 输入框拖高下限（≈默认两行）。上限拖时按面板实际高算（60%），并兜底 min+40：
 *  jsdom clientHeight=0、极小窗口面板过矮时，输入框至少还能向上扩 40px */
const AI_INPUT_MIN_PX = 64

/** 面板显示文案（2026-09 案头文件域参数化）：编辑器走 i18n key 组装，案头传自己的词典 */
export interface ChatPanelTexts {
  title: string
  placeholder: string
  emptyTitle: string
  emptyBody: string
}

/** 宿主注入面（Task 8 最终 Props 契约）：store/prompt/工具执行/守卫/确认回调——
 *  编辑器与案头各带自己的域，面板只消费不感知引擎 */
export interface ChatPanelDeps {
  store: ChatStore
  texts: ChatPanelTexts
  /** system prompt 组装（编辑器：导图快照；案头：工作区整理纪律） */
  buildPrompt(): string
  /** 用户选中行（AI 侧上下文）；null = 无 */
  buildSelectionLine(): string | null
  /** 发送前置守卫：返回错误文案则不发（编辑器：引擎未就绪）；null = 放行 */
  preSendGuard(): string | null
  executeTool(name: string, args: unknown): Promise<ToolCallResult>
  toolSchemas: unknown[]
  /** 发送前回调（案头：确认词检测置位确认门）；编辑器不传 */
  onUserMessage?(text: string): void
}

interface Props {
  deps: ChatPanelDeps
  /** 选中节点 chip 显示（仅展示；AI 侧合成在 buildSelectionLine）——编辑器传，案头 undefined */
  selection: { uid: string; text: string } | null
  width: number
  writeClipboard: WriteClipboard // 按轮复制（2026-09）：定稿回复复制钮的写入端口，测试注入内存桩
  onResize(w: number): void // 拖拽中每帧（内存态）
  onCommit(w: number): void // 松手落盘
  onReset(): void // 双击回默认宽
  onClose(): void
  /** 回合收尾持久化端口（2026-09 对话历史）：EditorView 接 appendTurn（adapter+mdPath 闭包），
   *  测试注入桩——同 writeClipboard 先例。闭包内自兜错误（console+toast），此处 void 不再捕 */
  persistTurn(msgs: ChatMessage[]): Promise<void>
  /** 重读流水挂待载入（2026-09 交互重构）：重新开始钮串联 clearSession 后调此——文件是
   *  全量流水，重开后 banner 回归、载入历史仍可回来（含刚聊的轮次）。同自兜合同 */
  reloadHistory(): Promise<void>
}

export default function ChatPanel({ deps, selection, width, writeClipboard, onResize, onCommit, onReset, onClose, persistTurn, reloadHistory }: Readonly<Props>) {
  const { t } = useTranslation()
  const messages = deps.store((s) => s.messages)
  const phase = deps.store((s) => s.phase)
  const contextNode = deps.store((s) => s.contextNode)
  const pendingHistory = deps.store((s) => s.pendingHistory)
  const [input, setInput] = useState('')
  // 输入框拖高（2026-09 长内容）：层级同面板宽（aiDragPx ?? aiChatWidth 先例），
  // 但松手不清暂存——持久层异步落盘窗口期清了会闪回（见 InputResizer onCommit 注释），
  // 暂存保持到同值落地；null = 默认两行（rows=2 自然高）
  const savedInputH = useAppStore((s) => s.aiChatInputHeight)
  const setSavedInputH = useAppStore((s) => s.setAiChatInputHeight)
  const [inputDragPx, setInputDragPx] = useState<number | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  // 自动跟随滚动（2026-09 多轮对话）：消息超出视口后最新回复落在底部看不见——
  // 贴底时自动滚。跟随意图记 stickRef（用户上翻即停跟，不抢滚动）
  const listRef = useRef<HTMLDivElement>(null)
  const listInnerRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const inputH = inputDragPx ?? savedInputH ?? null

  // v1.1（2026-09-13）：卸载即中止回合——关面板 = 不再需要，防后台孤儿回合继续编辑导图
  // （用户失去观察入口却不知情）。走全局句柄（终审 I2/I3 架构不废，正是它让卸载 cleanup
  // 不依赖组件 ref）：idle 时句柄为 null 安全 no-op；切图路径无交集（回合中切图本就被拦）。
  // deps.store 是稳定 zustand hook 引用（单例/工厂实例身份不变），依赖数组仍 []
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps.store 为稳定 hook 引用（宿主注入后身份不变），卸载中止只须挂载期绑一次
  useEffect(() => () => { deps.store.getState().stopRequest?.() }, [])

  // 跟随滚动的触发源：流式 delta / 新消息走 messages 引用变化，但定稿切 md 后
  // vditor 是异步队列渲染（MarkdownPreview 注释），撑高发生在引用变化之后——
  // 两类时点统一用 ResizeObserver 观察消息内容 wrapper 的尺寸变化覆盖；
  // observe 首挂必回调一次，重开面板带历史时直接落到最新。jsdom 无 RO（亦无
  // 布局，滚动不可见），守卫跳过保单测
  useEffect(() => {
    const inner = listInnerRef.current
    if (inner === null || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const el = listRef.current
      if (el !== null && stickRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  /** scroll 只在 scrollTop 变化时触发（内容撑高只变 scrollHeight，不会误清意图）：
   *  用户上翻→离开底部停跟；程序滚底或翻回底部→恢复跟随 */
  function handleListScroll(): void {
    const el = listRef.current
    if (el === null) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

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
    const chat = deps.store.getState()
    if (!text || chat.phase !== 'idle') return
    const ai = useAppStore.getState().aiConfig
    if (!ai.baseUrl || !ai.apiKey || !ai.model) {
      chat.pushError(i18n.t('ai.error.notConfigured'))
      return
    }
    // 发送前置守卫参数化：就绪判据归宿主（编辑器=引擎挂载；案头=恒放行）。返回错误文案
    // 则不发且不再无声失败（终审三叉#2 语义原样）——错误卡给显式出口指引重试
    const guard = deps.preSendGuard()
    if (guard !== null) {
      chat.pushError(guard)
      return
    }
    setInput('')
    deps.onUserMessage?.(text) // 发送前回调（spec §1.5，pushUser 前）：案头确认词检测置确认门
    // v1.1 ②：git 备份未启用（默认）且本会话未告知——首轮发送前插安全网信息卡（出现在
    // 用户消息上方）。纯指路（案头 → 设置 → 版本管理）不做面板内开关：设置已有入口避免重复
    const appNow = useAppStore.getState()
    if (!appNow.gitConfig.enabled && !appNow.aiBackupNoticeShown) {
      appNow.markAiBackupNoticeShown()
      chat.pushNotice(i18n.t('ai.notice.noBackup'))
    }
    // 对话历史回传（2026-09 持久化改道 windowedHistory）：user/assistant 文本尾部窗口化
    // （24000 字符预算，工具明细/卡片仍不回传）——加载长历史/长会话不会无限爆上下文；
    // 先取历史再 pushUser——runUserTurn 自会追加本轮 userText，取晚一步会把当前消息重复上送
    const history = windowedHistory(deps.store.getState().messages)
    const turnStartIdx = chat.messages.length // 本回合落盘切片起点（pushUser 前）
    chat.pushUser(text) // pushUser 顺带清 pendingHistory：发送即隐式「重新开始」
    // 上翻看历史中发送 = 注意力已回对话，强制回底跟随（否则自己的消息+后续回复都看不见）
    stickRef.current = true
    const sel = deps.buildSelectionLine()
    // 尾部斜杠循环剥除（Sonar S8786 只认单量词正则，/\/+$/ 亦被报——循行尾重复标记先例改循环）
    let base = ai.baseUrl
    while (base.endsWith('/')) base = base.slice(0, -1)
    const url = `${base}/chat/completions`
    beginAiTurn()
    // 回合进度显示（耗时+轮次）零点：与锁同点起表，finally 同批清零
    chat.setTurnStartedAt(Date.now())
    chat.setToolRound(0)
    const stop = createTurnStop()
    // transport 每回合新实例（Task 8 契约：实例不可跨回合复用/并发）
    const transport = getTransport()
    // 停止句柄挂 store（终审 I3）：回合中 ai-close 卸载重开后新组件实例 ref 归零，
    // 停止钮会 no-op（孤儿回合失控）——闭包同时持有 stop 与 transport，重开面板也能
    // 停掉在途回合。除 stop.request 外直接 abort transport（终审 I2）：模型停摆（无
    // 后续 delta）时 abort 传染不触发，不主动掐流就要挂到 Rust 空闲超时 120s 才收尾
    deps.store.getState().setStopRequest(() => {
      stop.request()
      transport.abort()
    })
    try {
      await runUserTurn(
        {
          transport,
          buildMessages: (msgs) => [
            { role: 'system', content: deps.buildPrompt() },
            ...msgs,
          ],
          executeTool: deps.executeTool,
          backupBeforeFirstEdit: async () => {
            await useAppStore.getState().backupNow()
          },
          // 工具清单是编排层职责（2026-09 案头文件域）：透传宿主注入域
          // （编辑器=结构域+画布域；案头=文件域）
          toolSchemas: deps.toolSchemas,
          on: {
            phase: (p) => {
              const chat = deps.store.getState()
              chat.setPhase(p)
              // 工具轮 round-2 回到 streaming 时把已定稿消息退回流式分支（终审 M3）：
              // delta 继续纯文本+光标追加，不再每 delta 一次全量 lute 重渲染，定稿再挂 md
              if (p === 'streaming') chat.unrenderLastAssistant()
            },
            delta: (d) => deps.store.getState().appendStreamDelta(d),
            finalize: () => deps.store.getState().finalizeStream(),
            card: (c) => deps.store.getState().pushCard(c),
            error: (msg) => deps.store.getState().pushError(msg),
            notice: (msg) => deps.store.getState().pushNotice(msg), // 收尾降级等中性信息卡
            round: (n) => deps.store.getState().setToolRound(n), // 回合进度：当前工具轮次
          },
        },
        stop,
        { url, apiKey: ai.apiKey, model: ai.model, history, userText: text, selection: sel },
      )
    } catch (err) {
      // 编排入口兜底出口（吞异常红线）：任何未预期异常落错误卡片
      console.error('AI 回合异常', err)
      deps.store.getState().pushError(err instanceof Error ? err.message : String(err))
    } finally {
      deps.store.getState().finalizeStream() // 停止/异常路径也定稿半截消息
      // 操作步骤完成即收起明细卡（2026-09）：回合中逐张展开可看进度，收尾折成摘要行；
      // 只动最后一条 assistant（本轮卡片全挂它），往轮留置态不扰
      deps.store.getState().collapseLastCards()
      deps.store.getState().setPhase('idle')
      deps.store.getState().setTurnStartedAt(null) // 进度秒表随回合收尾归零
      endAiTurn()
      deps.store.getState().setStopRequest(null) // 回合收尾即摘除全局停止句柄
      // 对话历史落盘（2026-09 持久化）：本回合 user/assistant（含卡片；error/notice 与空文本
      // 占位由 appendTurn 过滤）追加进 sidecar 流水。fire-and-forget：闭包自兜错误，不阻塞收尾
      void persistTurn(deps.store.getState().messages.slice(turnStartIdx))
    }
  }

  return (
    <aside
      ref={panelRef}
      data-testid="ai-panel"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col rounded-md border border-border bg-background"
    >
      <SplitResizer side="left" width={width} min={240} max={520} label={deps.texts.title} onResize={onResize} onCommit={onCommit} onReset={onReset} />
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">{deps.texts.title}</span>
        <div className="flex items-center gap-0.5">
          {/* 重新开始会话（2026-09 交互重构）：会话操作归 header——有对话且 AI 空闲才显示
              （处理中不能重开，防打断在途回合）。点击 = 清空当前会话 + 重读流水挂回 banner
              （文件全量流水，历史含刚聊的轮次，可再载入）——无损操作不弹确认 */}
          {messages.length > 0 && phase === 'idle' && (
            <button
              type="button"
              data-testid="ai-restart"
              aria-label={t('ai.panel.restartSession')}
              title={t('ai.panel.restartSessionHint')}
              onClick={() => {
                deps.store.getState().clearSession()
                void reloadHistory()
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          <button type="button" data-testid="ai-close" aria-label={t('ai.panel.close')} onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
      </header>
      {/* 历史对话提醒（2026-09 持久化）：打开的导图有历史流水且尚未载入时置顶提醒——此时
          只提供「载入历史」（「重新开始」是会话操作归 header，无对话时无意义）；首条消息
          发送 = 隐式不载入（pushUser 清 pendingHistory，banner 退场）。不透明 muted 底——
          半透明底深浅主题混叠看不清 */}
      {pendingHistory !== null && (
        <div data-testid="ai-history-banner" className="shrink-0 space-y-1.5 border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <p>
            {t('ai.panel.historyBanner', { n: pendingHistory.filter((m) => m.role === 'user').length })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="ai-history-load"
              onClick={() => deps.store.getState().loadPendingHistory()}
              className="rounded border border-border bg-background px-2 py-0.5 hover:bg-accent"
            >
              {t('ai.panel.historyLoad')}
            </button>
          </div>
        </div>
      )}
      <div ref={listRef} data-testid="ai-messages" onScroll={handleListScroll} className="flex-1 overflow-y-auto p-3 text-sm">
        {/* 内容 wrapper：ResizeObserver 的观察目标（容器自身 flex 定高，内容撑高要看它） */}
        <div ref={listInnerRef}>
          {messages.length === 0 ? (
            <div className="mt-8 space-y-1 text-center text-muted-foreground">
              <p className="font-medium text-foreground">{deps.texts.emptyTitle}</p>
              <p className="text-xs">{deps.texts.emptyBody}</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageRow key={m.id} msg={m} idx={i} writeClipboard={writeClipboard} onToggleCards={(id) => deps.store.getState().toggleCards(id)} />
            ))
          )}
        </div>
      </div>
      {/* 回合级状态行（2026-09 执行中指示常驻）：操作多时消息区变长，上翻看明细后
          流式光标/新卡片被滚出视口，面板内再无"还在执行"指示；executing 阶段定稿后
          更是连光标都没有。状态行放滚动区外（flex 布局恒占位），回合期间始终可见，
          收尾 finally 置 idle 即隐；文案复用画布状态签 ai.turn.badge。耗时+轮次
          （2026-09 优雅收尾配套）并入此行——人工防御的判断依据，觉得太久随时停 */}
      {phase !== 'idle' && (
        <div
          data-testid="ai-status"
          className="flex shrink-0 items-center gap-1.5 border-t border-border px-3 py-1.5 text-xs text-muted-foreground"
        >
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {t('ai.turn.badge')}
          <span className="text-border">·</span>
          <TurnProgress store={deps.store} />
          <span className="text-border">·</span>
          {t('ai.turn.tokenHint')}
        </div>
      )}
      {(contextNode ?? selection) && (
        <p className="shrink-0 truncate border-t border-border px-3 py-1.5 text-xs text-muted-foreground" data-testid="ai-context-chip">
          {t('ai.panel.contextChip', { text: (contextNode ?? selection)!.text })}
        </p>
      )}
      {/* 输入区（2026-09 长内容输入）：上缘拖高手柄 + 表单 + 快捷键常显提示；
          border-t 上移到容器（form 原自带），消息区 flex-1 自动让位。
          手柄 onCommit 不清拖拽暂存：持久层异步落盘（load-merge-save 磁盘 IO）窗口期内
          清了会闪回默认两行、落地后又跳回拖拽高——暂存保持到同值落地无感，双击重置才清 */}
      <div className="relative shrink-0 border-t border-border" data-testid="ai-input-area">
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
            placeholder={deps.texts.placeholder}
            rows={2}
            style={inputH === null ? undefined : { height: inputH }}
            className="min-w-0 flex-1 resize-none rounded-md border border-border bg-transparent p-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
          {phase === 'idle' ? (
            <button type="submit" data-testid="ai-send" aria-label={t('ai.panel.send')} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
              <Send className="size-4" />
            </button>
          ) : (
            <button type="button" data-testid="ai-stop" aria-label={t('ai.panel.stop')} onClick={() => deps.store.getState().stopRequest?.()} className="rounded-md bg-destructive p-2 text-destructive-foreground">
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

/** 回合进度（2026-09 轮次上限优雅收尾配套）：状态行内显示「耗时 · 第 N 轮」——人工防御
 *  的判断依据（觉得太久随时点停止钮）。秒表 1s 节流刷新、m:ss 等宽数字防跳动移位；
 *  startedAt 随回合起止写入/清空，phase=idle 时状态行不渲染、interval 随卸载清理。
 *  store 经 props 注入（2026-09 参数化）：编辑器/案头会话各自的进度互不串台 */
function TurnProgress({ store }: Readonly<{ store: ChatStore }>) {
  const { t } = useTranslation()
  const startedAt = store((s) => s.turnStartedAt)
  const round = store((s) => s.toolRound)
  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    if (startedAt === null) return
    const fmt = (t0: number): string => {
      const sec = Math.max(0, Math.floor((Date.now() - t0) / 1000))
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
    }
    setElapsed(fmt(startedAt)) // 挂载即显起点读数，不等首个整秒
    const id = window.setInterval(() => {
      try {
        setElapsed(fmt(startedAt))
      } catch (e) {
        console.warn('AI 回合进度秒表刷新失败', e) // 定时回调无抛错面，仍守自兜惯例（chatStore.notifyBlocked 同判）
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  return (
    <span data-testid="ai-turn-progress" className="tabular-nums">
      {t('ai.panel.turnProgress', { elapsed, round })}
    </span>
  )
}

function MessageRow({ msg, idx, writeClipboard, onToggleCards }: Readonly<{ msg: ChatMessage; idx: number; writeClipboard: WriteClipboard; onToggleCards(id: string): void }>) {
  if (msg.role === 'user') {
    // 复制钮在气泡左侧（行右对齐，气泡右侧无空位）；items-start 顶部对齐气泡
    return (
      <div className="group mb-2 flex items-start justify-end gap-1">
        <CopyButton text={msg.text} label={i18n.t('ai.panel.copyInput')} writeClipboard={writeClipboard} />
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
  return <AssistantRow msg={msg} idx={idx} writeClipboard={writeClipboard} onToggleCards={onToggleCards} />
}

/** 消息复制钮（2026-09 按轮复制，user/assistant 共用）：Copy→Check 就地反馈 1.5s（成功绿
 *  同卡片 ✓ 语言）。视觉 hover/focus 显隐、常驻 DOM 保键盘可达；定位归调用方——assistant
 *  绝对定位右上，user 流内气泡左侧，本体只管状态/点击/图标 */
function CopyButton({ text, label, writeClipboard }: Readonly<{ text: string; label: string; writeClipboard: WriteClipboard }>) {
  const [copied, setCopied] = useState(false)

  /** 事件回调里的异步异常框架会静默吞（吞异常红线），自兜出口：console + toast */
  async function handleCopy(): Promise<void> {
    try {
      await writeClipboard(text)
      setCopied(true)
      // 复位定时回调无抛错面（chatStore.notifyBlocked 同判）；组件已卸载时 setState 为 no-op
      window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('AI 面板消息复制失败', err)
      showToast(i18n.t('ai.panel.copyFailed'))
    }
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void handleCopy()}
      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}

/** assistant 回复行（2026-09 拆出）：定稿后 hover 右上角浮现复制钮，复制该轮 Markdown 原文。
 *  流式分支（rendered=false）文本未完整不显示钮 */
function AssistantRow({ msg, idx, writeClipboard, onToggleCards }: Readonly<{ msg: ChatMessage; idx: number; writeClipboard: WriteClipboard; onToggleCards(id: string): void }>) {
  // 滚动窗口（2026-09 有界队列）：未全折且超出窗口条数时，恒显最新 CARDS_WINDOW 条，
  // 较早的折进摘要（计数=较早条数，label 标「较早的」区分）；全折（回合收尾）摘要
  // 计总数。明细 testid 用原始下标（offset 起）——窗口滑动/展开形态切换间稳定标识
  const cards = msg.cards ?? []
  const total = cards.length
  const olderCount = total > CARDS_WINDOW ? total - CARDS_WINDOW : 0
  const windowed = !msg.cardsCollapsed && olderCount > 0 && msg.cardsWindowed !== false
  const shown = windowed ? cards.slice(total - CARDS_WINDOW) : cards
  const offset = total - shown.length
  const expanded = !msg.cardsCollapsed && !windowed
  return (
    <div className="group relative mb-3">
      {msg.rendered ? (
        <>
          <div className="absolute -top-1 right-0 z-10">
            <CopyButton text={msg.text} label={i18n.t('ai.panel.copyMessage')} writeClipboard={writeClipboard} />
          </div>
          <div className="prose prose-sm max-w-none" data-testid="ai-msg-md">
            <MarkdownPreview text={msg.text} />
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap" data-testid="ai-msg-streaming">
          {msg.text}
          <span className="animate-pulse">▍</span>
        </p>
      )}
      {/* 卡片 append-only 无删除重排（chatStore.pushCard 只追加），内容复合键即稳定标识。
          *  摘要行常驻（也是展开/收起的开关）——失败不静默：失败计数遍历全量卡，
          *  折进窗口/全折的失败也 surfaced 在摘要行（红色计数） */}
      {total > 0 && (
        <>
          <button
            type="button"
            data-testid={`ai-cards-toggle-${idx}`}
            aria-expanded={expanded}
            onClick={() => onToggleCards(msg.id)}
            className="mt-1 inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <ChevronRight
              className={cn('size-3 shrink-0 transition-transform', expanded && 'rotate-90')}
              aria-hidden
            />
            {/* 窗口态/全展开（>窗口条数）：摘要治理的是较早组；全折/≤窗口条数：治理全量 */}
            {olderCount > 0 && !msg.cardsCollapsed
              ? i18n.t('ai.panel.cardsOlder', { n: olderCount })
              : i18n.t('ai.panel.cardsSummary', { n: total })}
            {cards.some((c) => !c.ok) && (
              <span className="text-destructive">
                {i18n.t('ai.panel.cardsFailed', { n: cards.filter((c) => !c.ok).length })}
              </span>
            )}
          </button>
          {!msg.cardsCollapsed &&
            shown.map((c, j) => (
              <p
                key={`${c.kind}-${c.ok}-${offset + j}`}
                data-testid={`ai-card-${idx}-${offset + j}`}
                className={`mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${c.ok ? 'border-border text-muted-foreground' : 'border-destructive/40 text-destructive'}`}
              >
                {/* spec §7「成功绿/失败红」：成功仅 ✓ 图标着绿（克制处理，正文保持 muted）；失败整卡红 */}
                {c.ok ? <span className="text-emerald-600 dark:text-emerald-400">✓</span> : '✕'} {cardText(c)}
              </p>
            ))}
        </>
      )}
    </div>
  )
}

/** 卡片文案 key 映射（t() key 类型收紧至字面量集，动态拼串不可入参；未知 kind 回退工具原文） */
const CARD_LABEL_KEYS = {
  add: 'ai.card.add', update: 'ai.card.update', remove: 'ai.card.remove', move: 'ai.card.move',
  body: 'ai.card.body', icon: 'ai.card.icon', tag: 'ai.card.tag', expand: 'ai.card.expand',
  layout: 'ai.card.layout', link: 'ai.card.link', unlink: 'ai.card.unlink', file: 'ai.card.file',
} as const

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
        // 骑线式（同 SplitResizer 的 -left-1 几何）：absolute -top-1 h-2 越过容器 border-t，
        // 指示线（after top-1/2）正压边线，柄与边线零间隙；不占布局高（原流内 8px 死空隙已除）
        'input-resizer absolute -top-1 left-0 right-0 z-20 h-2 cursor-row-resize touch-none border-0',
        // 横向指示线（after）左右各缩 20px，hover 浮现；拖拽中 App.css 常亮
        'after:absolute after:left-5 after:right-5 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:rounded-full after:bg-border after:opacity-0 after:transition-opacity hover:after:opacity-100',
      )}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
    />
  )
}
