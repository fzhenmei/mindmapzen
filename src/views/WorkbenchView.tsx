// src/views/WorkbenchView.tsx —— 工作台（驾驶舱）：跨图任务聚合总览（spec 2026-09-13）。
// 只读 + 跳转（spec §1）：一切编辑回纸面做，本视图不写任何文件。纵向构图（§4 实际渲染序，
// 偏离文档顺序系有意裁定见 spec §11）：头部 → 最近 chip 行 → 下一步建议区 → 聚合看板
// （Task 5）→ 问问 AI 浮层（Task 8：无工具纯咨询，聚合上下文一次性问答）。
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { scanWorkTasks, WORK_DIR, type WorkScan, type WorkTask } from '../services/workbench'
import { adviceFingerprint, ADVICE_TTL_MS, buildSuggestPrompt, suggestNext, type Suggestion } from '../services/workbenchSuggest'
import { BOARD_STATUSES } from '../services/statusMarkers'
import { getTransport, parseDeltaChunk } from '../services/ai/client'
import { joinPath } from '../services/workspace'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import WorkbenchCard from '../components/WorkbenchCard'

/** 最近 chip 行（spec §5）：持久 MRU 前 8 一键回图，只 openMap 不定位；
 *  chip 失联文件由 openMap 后 EditorView 既有错误链路兜底，与案头欢迎页同口径 */
function RecentChips({ recentOpened, onOpen }: Readonly<{ recentOpened: string[]; onOpen: (p: string) => void }>) {
  const { t } = useTranslation()
  if (recentOpened.length === 0) return null
  return (
    <section className="mb-6" aria-label={t('workbench.recent.section')}>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('workbench.recent.section')}</h2>
      <div className="flex flex-wrap gap-2">
        {recentOpened.slice(0, 8).map((p) => (
          <button
            key={p}
            type="button"
            data-testid="workbench-recent-chip"
            className="rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted"
            onClick={() => onOpen(p)}
          >
            {/* pop() 可能返回 undefined——?. + ?? p 兜底，勿裸 non-null */}
            {p.split('/').pop()?.replace(/\.md$/, '') ?? p}
          </button>
        ))}
      </div>
    </section>
  )
}

/** 下一步建议区（spec §6）：理由 reasonKey 经 i18n 渲染，低优先级不越位补位；
 *  task 级点击走 openTask（置定位），map 级只进图不定位（spec §5）。
 *  标题行恒渲染（含行尾「问问 AI」钮）：建议列表可为空，但有任务即可问 AI——
 *  空建议不再整段退场（Task 8「有任务即可点」口径） */
function SuggestSection({
  suggestions,
  openTask,
  openMapOnly,
  onAskAi,
  aiReady,
}: Readonly<{
  suggestions: Suggestion[]
  openTask: (t: WorkTask) => void
  openMapOnly: (p: string) => void
  onAskAi: () => void
  aiReady: boolean
}>) {
  const { t } = useTranslation()
  return (
    <section className="mb-6" aria-label={t('workbench.suggest.section')}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('workbench.suggest.section')}</h2>
        {/* onClick 箭头包装防 event 顶参：直绑 onAskAi 时 click 事件对象会传成
            askAi(force) 的首参（truthy）——缓存判定恒被跳过，2026-09-14 实锤踩过 */}
        <button
          type="button"
          data-testid="btn-workbench-ask-ai"
          className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!aiReady}
          title={aiReady ? undefined : t('workbench.ai.disabledHint')}
          onClick={() => onAskAi()}
        >
          {t('workbench.suggest.askAi')}
        </button>
      </div>
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {suggestions.map((sg) => {
            const target = sg.task !== undefined ? `${sg.task.mapName} · ${sg.task.text}` : (sg.mapName ?? '')
            const onClick = (): void => {
              if (sg.task !== undefined) openTask(sg.task)
              else if (sg.mapPath !== undefined) openMapOnly(sg.mapPath)
            }
            return (
              <button
                key={`${sg.kind}:${target}`}
                type="button"
                data-testid="workbench-suggestion"
                className="rounded-md border bg-card px-4 py-2 text-left text-sm hover:bg-muted"
                onClick={onClick}
              >
                {/* 冒号收进词条（zh 全角 / en 半角+空格），理由与目标的分隔不硬编码在 JSX */}
                {t(sg.reasonKey)}{t('workbench.suggest.itemJoin')}{target}
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

/** 聚合看板（spec §4）：四列分组（BOARD_STATUSES），点击卡片跨图跳转（文本寻址定位） */
function BoardSection({ tasks, onOpen }: Readonly<{ tasks: WorkTask[]; onOpen: (t: WorkTask) => void }>) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('workbench.board.section')}>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('workbench.board.section')}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BOARD_STATUSES.map((s) => {
          const cards = tasks.filter((x) => x.status === s)
          return (
            <div key={s} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2" data-testid={`workbench-col-${s}`}>
              {/* 计数用中点分隔（U+00B7）：两语言通用，en 侧不渗全角括号 */}
              <p className="px-1 text-xs font-medium text-muted-foreground">
                {t(`editor.kanban.status.${s}`)} · {cards.length}
              </p>
              {cards.map((x) => (
                <WorkbenchCard key={`${x.mapPath}#${x.uid}`} task={x} onOpen={onOpen} />
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** 问问 AI 浮层状态机（spec §7 无工具纯咨询）：聚合上下文一次性问答，不走 agentLoop
 *  工具链（引擎命令在无打开图时无意义）。独立成 hook：WorkbenchView 主组件认知复杂度
 *  已在 S3776 限值上，再叠流式编排必超。 */
function useAskAi(scan: WorkScan | null): {
  aiReady: boolean
  aiOpen: boolean
  aiText: string
  aiPhase: 'idle' | 'streaming' | 'done' | 'error'
  /** force=true 跳过缓存（「再问一次」）；缺省走双条件缓存判定 */
  askAi: (force?: boolean) => void
  /** 停止等待（2026-09-14 试用反馈）：掐断在途流、保留半截文本——与关浮层共用
   *  aiAbortRef（aborted ≠ error，不落错误文案），但浮层留着供用户看已到内容 */
  stopAi: () => void
  closeAi: (o: boolean) => void
} {
  const aiConfig = useAppStore((s) => s.aiConfig)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiPhase, setAiPhase] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const aiAbortRef = useRef<(() => void) | null>(null)
  const aiReady = aiConfig.baseUrl !== '' && aiConfig.apiKey !== '' && aiConfig.model !== ''

  /** onDelta 在 transport Promise 回调内——自包 try/catch（React 外异步异常会被运行时
   *  静默吞且不留痕，红线）；delta 按契约是原始 OpenAI chunk JSON，解析取 content 累积。
   *  提为 hook 级独立函数：嵌套在 askAi 内会推高其认知复杂度（S3776） */
  /** 最终文本的 ref 镜像：流结束存档要在 outcome 后读全文，setAiText 的函数式更新读
   *  不到当前值——闭包里的 aiText 是渲染时快照。与 state 双写，重置处同步清 */
  const aiTextRef = useRef('')

  const handleDelta = (d: string): void => {
    try {
      const text = parseDeltaChunk(d)?.text
      if (text !== undefined) {
        aiTextRef.current += text
        setAiText(aiTextRef.current)
      }
    } catch (e) {
      console.error('工作台 AI 流式渲染失败', e)
    }
  }

  /** force = 「再问一次」：跳过缓存直接请求（2026-09-14 缓存增强） */
  const askAi = async (force = false): Promise<void> => {
    if (scan === null) return
    const fingerprint = adviceFingerprint(scan)
    if (!force) {
      // 双条件缓存命中（24h 内且任务指纹一致）：直接展示上次建议，零请求零等待
      const hit = useAppStore.getState().aiAdvice
      if (hit !== null && Date.now() - hit.at <= ADVICE_TTL_MS && hit.fingerprint === fingerprint) {
        aiTextRef.current = hit.text
        setAiText(hit.text)
        setAiPhase('done')
        setAiOpen(true)
        return
      }
    }
    const ai = useAppStore.getState().aiConfig
    // 尾部斜杠循环剥除（Sonar S8786 只认单量词正则，/\/+$/ 亦被报——ChatPanel 先例改循环）
    let base = ai.baseUrl
    while (base.endsWith('/')) base = base.slice(0, -1)
    const transport = getTransport()
    aiAbortRef.current = (): void => transport.abort()
    setAiOpen(true)
    aiTextRef.current = ''
    setAiText('')
    setAiPhase('streaming')
    try {
      const outcome = await transport.start(
        {
          url: `${base}/chat/completions`,
          apiKey: ai.apiKey,
          body: {
            model: ai.model,
            messages: [{ role: 'user', content: buildSuggestPrompt(scan, suggestNext(scan, Date.now())) }],
            stream: true,
          },
        },
        handleDelta,
      )
      if (outcome.endedWith === 'error') {
        // 双显式出口（不吞异常红线）：UI 错误文案 + console 线索（errorMessage/status 便于排障）
        console.error('工作台 AI 咨询失败', outcome.errorMessage ?? '', outcome.status ?? '')
        setAiPhase('error')
      } else {
        setAiPhase('done') // aborted ≠ error：本地掐流不是故障，不误报
        // 只有正常完成才存档（2026-09-14 缓存）：错误/中止的半截文本对下次无意义。
        // 持久化失败不阻塞展示（缓存是优化非关键路径）——console 留线索即可
        if (outcome.endedWith === 'done' && aiTextRef.current !== '') {
          await useAppStore.getState().setAiAdvice({ text: aiTextRef.current, at: Date.now(), fingerprint }).catch((e: unknown) => {
            console.error('AI 建议缓存持久化失败', e)
          })
        }
      }
    } catch (e) {
      console.error('工作台 AI 咨询失败', e)
      setAiPhase('error')
    } finally {
      // 回合收尾即摘除 abort 句柄（对齐 ChatPanel 口径）：流已结束，closeAi/卸载不再
      // 触发过期 transport.abort()（浮层互斥保证单流在途，无句柄被新回合覆盖的竞态）
      aiAbortRef.current = null
    }
  }

  // 卸载兜底：在途流掐断（关浮层=不再需要，防孤儿流）——closeAi 关闭路径同样掐
  useEffect(() => () => aiAbortRef.current?.(), [])

  const closeAi = (o: boolean): void => {
    if (!o) aiAbortRef.current?.()
    setAiOpen(o)
  }
  return { aiReady, aiOpen, aiText, aiPhase, askAi, stopAi: () => aiAbortRef.current?.(), closeAi }
}

export default function WorkbenchView() {
  const { t, i18n } = useTranslation()
  const adapter = useAppStore((s) => s.adapter)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const backToLibrary = useAppStore((s) => s.backToLibrary)
  const recentOpened = useAppStore((s) => s.recentOpened)
  // error 横幅本路由自渲染：唯一既有出口在 LibraryView，workbench 路由不经过——
  // 不订阅则 setError 只落 store，用户无声且回案头时以陈旧横幅弹出（审查 Important-1）
  const error = useAppStore((s) => s.error)
  const [scan, setScan] = useState<WorkScan | null>(null)
  const [scanning, setScanning] = useState(true)

  /** 即时聚合（spec §1）：每次进入/触发全量重扫，离开即弃。顶层 catch 是防御性
   *  第二出口（单文件失败已在服务层收进 failed）——不吞异常，留 console.error 线索 */
  const rescan = useCallback(async (): Promise<void> => {
    if (workspaceDir === null) return
    setScanning(true)
    try {
      setScan(await scanWorkTasks(adapter, workspaceDir))
    } catch (e) {
      console.error('工作台聚合失败', e)
      setScan({ dirExists: false, maps: [], tasks: [], failed: [] })
    } finally {
      setScanning(false)
    }
  }, [adapter, workspaceDir])

  useEffect(() => {
    void rescan()
  }, [rescan])

  const createWorkDir = async (): Promise<void> => {
    try {
      await adapter.ensureDir(joinPath(workspaceDir ?? '', WORK_DIR))
    } catch (e) {
      console.error('创建工作目录失败', e)
      // 失败必须有显式出口（不吞异常红线）：setError 走 appStore 全局横幅，保留 console 线索
      useAppStore.getState().setError(t('workbench.createFailed'))
      return
    }
    await rescan()
  }

  /** 跨图跳转（spec §5，文本寻址）：先置 pendingLocate 再 openMap——EditorView onReady
   *  消费定位；寻址器用 path+text（md 不序列化 uid，扫描期 uid 引擎侧必失配，见 spec §11）；
   *  mapPath 绑定目标图（终审 Important-1 错图消费修复）：openMap 失败寻址器残留时，
   *  切到别图消费前按它校验弃置；顺序不可反（openMap 后组件卸载，后续 set 无害但语义上定位先声明） */
  const openTask = (task: WorkTask): void => {
    useAppStore.getState().setPendingLocate({ mapPath: task.mapPath, path: task.path, text: task.text })
    void useAppStore.getState().openMap(task.mapPath)
  }

  /** map 级建议/chip 跳转：只进图不定位（spec §5——「最近」与图级建议不带 uid） */
  const openMapOnly = (mapPath: string): void => {
    void useAppStore.getState().openMap(mapPath)
  }
  const suggestions: Suggestion[] = scan === null ? [] : suggestNext(scan, Date.now())

  /** 看板可见任务数（archived/dropped 不占列）：空态/看板/建议区统一用它做总门控，
   *  避免「只有归档任务的目录」渲染成四个全空列、跳过空态引导 */
  const visibleTasks = scan === null ? [] : scan.tasks.filter((x) => BOARD_STATUSES.includes(x.status))
  const { aiReady, aiOpen, aiText, aiPhase, askAi, stopAi, closeAi } = useAskAi(scan)

  return (
    <div className="flex h-full flex-col bg-background" data-testid="workbench-view">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold">{t('workbench.title')}</h1>
        <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => void backToLibrary()}>
          {t('workbench.toLibrary')}
        </button>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {scanning && scan === null ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground" data-testid="workbench-loading">
            {t('workbench.scanning')}
          </div>
        ) : null}
        {scan !== null && scan.failed.length > 0 ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive" data-testid="workbench-failed-bar">
            {/* 冒号在词条内（zh 全角 / en 半角+空格）；names 分隔符随语言——en 侧不渗全角顿号 */}
            {t('workbench.failedBar', { count: scan.failed.length })}
            {scan.failed.join(i18n.language === 'en' ? ', ' : '、')}
          </div>
        ) : null}
        {scan !== null && !scan.dirExists ? (
          <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center">
            <p className="font-medium">{t('workbench.empty.noDirTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('workbench.empty.noDirBody')}</p>
            <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" data-testid="workbench-empty-create" onClick={() => void createWorkDir()}>
              {t('workbench.empty.create')}
            </button>
          </div>
        ) : null}
        {/* 纵向构图（spec §4）：最近 chip 行（内容最上）→ 下一步建议 → 聚合看板 */}
        <RecentChips recentOpened={recentOpened} onOpen={openMapOnly} />
        {scan !== null && scan.dirExists && visibleTasks.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">{t('workbench.empty.noTasks')}</p>
        ) : null}
        {scan !== null && visibleTasks.length > 0 ? (
          <SuggestSection suggestions={suggestions} openTask={openTask} openMapOnly={openMapOnly} onAskAi={askAi} aiReady={aiReady} />
        ) : null}
        {scan !== null && visibleTasks.length > 0 ? <BoardSection tasks={scan.tasks} onOpen={openTask} /> : null}
      </div>
      <Dialog open={aiOpen} onOpenChange={closeAi}>
        {/* 宽度覆盖必须同断点压制默认 sm:max-w-lg（Dialog max-w 变体坑），裸 max-w-2xl 会被源序反杀 */}
        <DialogContent className="sm:max-w-none sm:max-w-2xl" data-testid="workbench-ai-dialog">
          <DialogTitle>{t('workbench.ai.title')}</DialogTitle>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm" data-testid="workbench-ai-text">
            {aiText}
            {/* 首 token 前占位（2026-09-14 试用反馈）：推理模型首 token 可达十几秒，
                纯空白会被当成卡死——呼吸态文案到首 delta 让位 */}
            {aiText === '' && aiPhase === 'streaming' ? (
              <p className="animate-pulse text-muted-foreground" data-testid="workbench-ai-thinking">
                {t('workbench.ai.thinking')}
              </p>
            ) : null}
          </div>
          {aiPhase === 'error' ? (
            <p className="text-sm text-destructive" data-testid="workbench-ai-error">{t('workbench.ai.error')}</p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            {/* 费用知情（2026-09-14 试用反馈）：BYOK 服务的计费策略用户自知，提示而非拦截 */}
            <p className="text-xs text-muted-foreground" data-testid="workbench-ai-fee-note">{t('workbench.ai.feeNote')}</p>
            {aiPhase === 'streaming' ? (
              <button
                type="button"
                data-testid="workbench-ai-stop"
                className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-muted"
                onClick={stopAi}
              >
                {t('workbench.ai.stop')}
              </button>
            ) : aiPhase === 'done' || aiPhase === 'error' ? (
              /* 再问一次（2026-09-14 缓存增强）：缓存直读/流式完成/失败重试三态可达，
                 强制跳过缓存重新请求并覆盖存档 */
              <button
                type="button"
                data-testid="workbench-ai-ask-again"
                className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-muted"
                onClick={() => void askAi(true)}
              >
                {t('workbench.ai.askAgain')}
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
