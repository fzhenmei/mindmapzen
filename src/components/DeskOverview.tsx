// src/components/DeskOverview.tsx —— 案头总览区（2026-09 画布三态 M3，工作台并入欢迎页）：
// GTD 下一步建议 + 跨图任务聚合 + 问问 AI 浮层。2026-09 验收微调：两区弃卡片改
// 「最近的」同款全宽行列表（聚合每状态段=行头+行列表，无卡不渲染段）。扫描走
// scanWorkTasksCached（mtime 指纹缓存，回案头零重复读）。空态分层：
// 工作/ 目录不存在 → 轻引导（页面退役后唯一创建入口）；目录在但无可见任务 → 内容整段
// 退场（欢迎页退化为纯开始区）。跳转协议原工作台 spec §5（文本寻址 pendingLocate +
// openMap；先置定位再开图，顺序不可反）。挂在 WelcomePane overview slot（最近的之后）。
// 渲染面拆文件内局部子组件（S3776）：SuggestSection（建议区）/StatusRows（聚合行）/
// AiDialog（AI 浮层）各自成株，主组件只留扫描状态机与总门控。
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { scanWorkTasksCached, WORK_DIR, type WorkScan, type WorkTask } from '../services/workbench'
import { ADVICE_TTL_MS, adviceFingerprint, buildSuggestPrompt, suggestNext, type Suggestion } from '../services/workbenchSuggest'
import { BOARD_STATUSES } from '../services/statusMarkers'
import { getTransport, parseDeltaChunk } from '../services/ai/client'
import { joinPath } from '../services/workspace'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'

/** 问问 AI 浮层的回合相位（useAskAi 状态机三处共用：state/返回类型/浮层 props） */
type AiPhase = 'idle' | 'streaming' | 'done' | 'error'

/** 下一步建议区（原工作台 spec §6 迁移）：理由 reasonKey 经 i18n 渲染，低优先级不越位
 *  补位；task 级点击走 openTask（置定位），map 级只进图不定位（spec §5）。
 *  标题行恒渲染（含「问问 AI」钮）：建议列表可为空，但有任务即可问 AI——空建议
 *  不再整段退场（「有任务即可点」口径）。2026-09 验收微调：建议项弃卡片，
 *  改「最近的」同款全宽行（divide-y + hover:bg-accent，文案单行 truncate） */
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
    <section className="mb-8" aria-label={t('workbench.suggest.section')}>
      <h2 className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-destructive" />
        {t('workbench.suggest.section')}
      </h2>
      {/* 问问 AI 钮居中入列（纵轴构图，随小节题对齐）；onClick 箭头包装防 event 顶参：
          直绑 onAskAi 时 click 事件对象会传成 askAi(force) 的首参（truthy）——缓存判定
          恒被跳过，2026-09-14 实锤踩过 */}
      <div className="mb-3 flex justify-center">
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
        <ul className="flex flex-col divide-y">
          {suggestions.map((sg) => {
            const target = sg.task !== undefined ? `${sg.task.mapName} · ${sg.task.text}` : (sg.mapName ?? '')
            const onClick = (): void => {
              if (sg.task !== undefined) openTask(sg.task)
              else if (sg.mapPath !== undefined) openMapOnly(sg.mapPath)
            }
            return (
              <li key={`${sg.kind}:${target}`}>
                <button type="button" data-testid="workbench-suggestion"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={onClick}>
                  {/* 冒号收进词条（zh 全角 / en 半角+空格）；count 透传 {{count}} 插值（spec §6 v1.1）；
                      text-[13px] 与「最近的」/聚合行主文本同号（验收微调：原 text-sm 大 1px） */}
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {t(sg.reasonKey, { count: sg.count })}{t('workbench.suggest.itemJoin')}{target}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

/** 聚合任务行（原 WorkbenchCard 行列表化）：「最近的」同款全宽行——徽标+文本+路径段（窄屏隐藏）+子任务数 */
function taskRow(x: WorkTask, onOpen: (task: WorkTask) => void) {
  const p = x.dirRel === '' ? x.path.join(' / ') : [x.dirRel, ...x.path].join(' / ')
  return (
    <li key={`${x.mapPath}#${x.uid}`}>
      <button type="button" data-testid="workbench-card"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
        onClick={() => onOpen(x)}>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-file text-xs text-muted-foreground">{x.mapName}</span>
        <span className="min-w-0 flex-1 truncate font-file text-[13px]">{x.text}</span>
        {p !== '' && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{p}</span>}
        {x.childCount > 0 && <span className="shrink-0 text-xs text-muted-foreground">+{x.childCount}</span>}
      </button>
    </li>
  )
}

/** 纵向聚合段渲染（原工作台四列看板改造，M3 spec §10）：每状态一段=行头+全宽行列表，
 *  无卡不渲染段。文件内局部子组件——行级渲染分支自主组件抽离（S3776：主组件只留扫描
 *  状态机与总门控）；tasks 传已过滤的可见任务（archived/dropped 不占行） */
function StatusRows({ tasks, onOpen }: Readonly<{ tasks: WorkTask[]; onOpen: (t: WorkTask) => void }>) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('workbench.board.section')}>
      <h2 className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium tracking-widest text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-destructive" />
        {t('workbench.board.section')}
      </h2>
      <div className="flex flex-col gap-4">
        {BOARD_STATUSES.map((s) => {
          const cards = tasks.filter((x) => x.status === s)
          if (cards.length === 0) return null // 无卡不渲染段（M3 spec §10 裁定）
          return (
            <div key={s} data-testid={`workbench-row-${s}`}>
              {/* 计数用中点分隔（U+00B7）：两语言通用，en 侧不渗全角括号 */}
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t(`editor.kanban.status.${s}`)} · {cards.length}
              </p>
              <ul className="flex flex-col divide-y">
                {cards.map((x) => taskRow(x, onOpen))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** 问问 AI 浮层状态机（原工作台 spec §7 无工具纯咨询）：聚合上下文一次性问答，不走
 *  agentLoop 工具链（引擎命令在无打开图时无意义）。独立成 hook：主组件认知复杂度
 *  已在 S3776 限值上，再叠流式编排必超。 */
function useAskAi(scan: WorkScan | null): {
  aiReady: boolean
  aiOpen: boolean
  aiText: string
  aiPhase: AiPhase
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
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle')
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
      console.error('案头总览 AI 流式渲染失败', e)
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
        console.error('案头总览 AI 咨询失败', outcome.errorMessage ?? '', outcome.status ?? '')
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
      console.error('案头总览 AI 咨询失败', e)
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

/** 问问 AI 浮层（原工作台 spec §7）：流式文本 + 首 token 占位 + 费用提示与三态按钮
 *  区。文件内局部子组件——浮层渲染分支自主组件抽离（S3776）；按钮区以互斥 && 链
 *  替代嵌套三元（S3358：streaming 停止 / done·error 再问一次 / idle 无钮） */
function AiDialog({
  open,
  onOpenChange,
  text,
  phase,
  onStop,
  onAskAgain,
}: Readonly<{
  open: boolean
  onOpenChange: (o: boolean) => void
  text: string
  phase: AiPhase
  onStop: () => void
  onAskAgain: () => void
}>) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 宽度覆盖必须同断点压制默认 sm:max-w-lg（Dialog max-w 变体坑），裸 max-w-2xl 会被源序反杀 */}
      <DialogContent className="sm:max-w-none sm:max-w-2xl" data-testid="workbench-ai-dialog">
        <DialogTitle>{t('workbench.ai.title')}</DialogTitle>
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm" data-testid="workbench-ai-text">
          {text}
          {/* 首 token 前占位（2026-09-14 试用反馈）：推理模型首 token 可达十几秒，
              纯空白会被当成卡死——呼吸态文案到首 delta 让位 */}
          {text === '' && phase === 'streaming' ? (
            <p className="animate-pulse text-muted-foreground" data-testid="workbench-ai-thinking">
              {t('workbench.ai.thinking')}
            </p>
          ) : null}
        </div>
        {phase === 'error' ? (
          <p className="text-sm text-destructive" data-testid="workbench-ai-error">{t('workbench.ai.error')}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          {/* 费用知情（2026-09-14 试用反馈）：BYOK 服务的计费策略用户自知，提示而非拦截 */}
          <p className="text-xs text-muted-foreground" data-testid="workbench-ai-fee-note">{t('workbench.ai.feeNote')}</p>
          {phase === 'streaming' && (
            <button
              type="button"
              data-testid="workbench-ai-stop"
              className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-muted"
              onClick={onStop}
            >
              {t('workbench.ai.stop')}
            </button>
          )}
          {/* 再问一次（2026-09-14 缓存增强）：缓存直读/流式完成/失败重试三态可达，
             强制跳过缓存重新请求并覆盖存档 */}
          {(phase === 'done' || phase === 'error') && (
            <button
              type="button"
              data-testid="workbench-ai-ask-again"
              className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-muted"
              onClick={onAskAgain}
            >
              {t('workbench.ai.askAgain')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 案头总览区：无 props 自取 store（同原工作台模式）。总览嵌在欢迎页纵轴流里，
 *  只占内容高度不占满屏——错误横幅不自渲染（案头 LibraryView 已有出口，setError
 *  落 store 即达用户），与原工作台路由自渲染横幅的差异点 */
export default function DeskOverview() {
  const { t, i18n } = useTranslation()
  const adapter = useAppStore((s) => s.adapter)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const [scan, setScan] = useState<WorkScan | null>(null)
  const [scanning, setScanning] = useState(true)
  // 目录级 IO 故障（M3 spec §3.2：错误占位不阻塞欢迎页上段）——区别于 dirExists=false
  //（后者是「未建目录」走轻引导，IO 故障时目录其实在，误显引导会误导创建）
  const [scanFailed, setScanFailed] = useState(false)

  /** 即时聚合（原工作台语义）：顶层 catch 防御性第二出口（单文件失败在服务层进 failed）；
   *  缓存版入口（M3 改动点）——回案头 mtime 全等时零重复读 */
  const rescan = useCallback(async (): Promise<void> => {
    if (workspaceDir === null) return
    setScanning(true)
    setScanFailed(false)
    try {
      setScan(await scanWorkTasksCached(adapter, workspaceDir))
    } catch (e) {
      console.error('案头总览聚合失败', e)
      // 重扫失败必须清旧 scan：否则「先成功后失败」序列下旧任务卡与错误占位并存，
      // 或旧 dirExists:false 残留误显创建引导（回归守卫：DeskOverview.test 末例）
      setScan(null)
      setScanFailed(true)
    } finally {
      setScanning(false)
    }
  }, [adapter, workspaceDir])

  useEffect(() => {
    // fire-and-forget 启动扫描：rescan 自包全量 try/catch/finally（恒 resolve），无出口需求
    rescan()
  }, [rescan])

  const createWorkDir = async (): Promise<void> => {
    try {
      await adapter.ensureDir(joinPath(workspaceDir ?? '', WORK_DIR))
    } catch (e) {
      console.error('创建工作目录失败', e)
      // 失败必须有显式出口（不吞异常红线）：setError 走案头全局横幅，保留 console 线索
      useAppStore.getState().setError(t('workbench.createFailed'))
      return
    }
    await rescan()
  }

  /** fire-and-forget 打开导图：openMap 含配置写盘（可失败），失败必须留 console 线索
   *  （不吞异常红线）；Promise.resolve 兼容测试桩的同步返回（vi.fn 无返回值） */
  const openMapQuietly = (mdPath: string): void => {
    Promise.resolve(useAppStore.getState().openMap(mdPath)).catch((e: unknown) => {
      console.error('案头总览跳转打开失败', e)
    })
  }

  /** 跨图跳转（原工作台 spec §5 文本寻址，2026-09 跳看板）：先置 pendingLocate（带
   *  view:'kanban'）+ viewMode 再 openMap——openMap 不重置 viewMode，编辑器直接以
   *  看板态挂载，EditorView onReady 消费时把载荷下发 KanbanView 高亮命中卡；回导图
   *  定位经看板卡菜单仍可达，能力不丢。寻址器用 path+text（md 不序列化 uid，扫描期
   *  uid 引擎侧必失配）；mapPath 绑定目标图（终审 Important-1 错图消费修复）；顺序
   *  不可反（openMap 后组件卸载，后续 set 无害但语义上定位先声明）。失败回收：开图
   *  失败时弃置寻址器 + 看板态复位导图（错图防线本会兜，显式清更自洽——viewMode
   *  残留会把下一次开图误落看板态） */
  const openTask = (task: WorkTask): void => {
    const st = useAppStore.getState()
    st.setViewMode('kanban')
    st.setPendingLocate({ mapPath: task.mapPath, path: task.path, text: task.text, view: 'kanban' })
    Promise.resolve(st.openMap(task.mapPath)).catch((e: unknown) => {
      console.error('案头总览跳转打开失败', e)
      const s = useAppStore.getState()
      s.setPendingLocate(null)
      s.setViewMode('mindmap')
    })
  }

  /** map 级建议跳转：只进图不定位（原工作台 spec §5——图级建议不带 uid） */
  const openMapOnly = (mapPath: string): void => {
    openMapQuietly(mapPath)
  }

  const suggestions: Suggestion[] = scan === null ? [] : suggestNext(scan, Date.now())
  // 看板可见任务数（archived/dropped 不占行）：内容总门控（原工作台口径迁移）
  const visibleTasks = scan === null ? [] : scan.tasks.filter((x) => BOARD_STATUSES.includes(x.status))
  const { aiReady, aiOpen, aiText, aiPhase, askAi, stopAi, closeAi } = useAskAi(scan)
  const hasContent = scan !== null && scan.dirExists && visibleTasks.length > 0

  return (
    <section className="w-full" data-testid="desk-overview" aria-label={t('workbench.board.section')}>
      {scanning && scan === null ? (
        <p className="py-4 text-center text-sm text-muted-foreground" data-testid="desk-overview-loading">
          {t('workbench.scanning')}
        </p>
      ) : null}
      {/* 目录级 IO 故障占位（M3 spec §3.2）：console 线索在上，此处可见占位不吞异常 */}
      {scanFailed ? (
        <p className="py-4 text-center text-sm text-destructive" data-testid="desk-overview-error">
          {t('workbench.scanFailed')}
        </p>
      ) : null}
      {scan !== null && scan.failed.length > 0 ? (
        /* failed-bar 原样迁移（原工作台），mb-4 → mb-8 对齐欢迎页节奏 */
        <div className="mb-8 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive" data-testid="workbench-failed-bar">
          {/* 冒号在词条内（zh 全角 / en 半角+空格）；names 分隔符随语言——en 侧不渗全角顿号 */}
          {t('workbench.failedBar', { count: scan.failed.length })}
          {scan.failed.join(i18n.language === 'en' ? ', ' : '、')}
        </div>
      ) : null}
      {/* 轻引导（M3 空态分层裁定）：工作台页面退役后 工作/ 目录创建唯一入口 */}
      {scan !== null && !scan.dirExists ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center">
          <p className="text-sm text-muted-foreground">{t('workbench.empty.noDirBody')}</p>
          <button type="button" data-testid="desk-overview-create"
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground"
            onClick={() => { createWorkDir() }}>
            {t('workbench.empty.create')}
          </button>
        </div>
      ) : null}
      {hasContent ? (
        <>
          <SuggestSection suggestions={suggestions} openTask={openTask} openMapOnly={openMapOnly} onAskAi={askAi} aiReady={aiReady} />
          {/* 纵向聚合（原四列看板改造，M3 spec §10）：每状态一段，无卡不渲染段 */}
          <StatusRows tasks={visibleTasks} onOpen={openTask} />
        </>
      ) : null}
      <AiDialog open={aiOpen} onOpenChange={closeAi} text={aiText} phase={aiPhase} onStop={stopAi} onAskAgain={() => { askAi(true) }} />
    </section>
  )
}
