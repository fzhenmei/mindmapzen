// src/views/WorkbenchView.tsx —— 工作台（驾驶舱）：跨图任务聚合总览（spec 2026-09-13）。
// 只读 + 跳转（spec §1）：一切编辑回纸面做，本视图不写任何文件。纵向构图（§4）：
// 头部 → 聚合看板（Task 5）→ 下一步建议区/最近（Task 6 完整化）。
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { scanWorkTasks, WORK_DIR, type WorkScan, type WorkTask } from '../services/workbench'
import { suggestNext, type Suggestion } from '../services/workbenchSuggest'
import { BOARD_STATUSES } from '../services/statusMarkers'
import { joinPath } from '../services/workspace'
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
 *  task 级点击走 openTask（置定位），map 级只进图不定位（spec §5） */
function SuggestSection({
  suggestions,
  openTask,
  openMapOnly,
}: Readonly<{
  suggestions: Suggestion[]
  openTask: (t: WorkTask) => void
  openMapOnly: (p: string) => void
}>) {
  const { t } = useTranslation()
  if (suggestions.length === 0) return null
  return (
    <section className="mb-6" aria-label={t('workbench.suggest.section')}>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('workbench.suggest.section')}</h2>
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
              {t(sg.reasonKey)}：{target}
            </button>
          )
        })}
      </div>
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
   *  顺序不可反（openMap 后组件卸载，后续 set 无害但语义上定位先声明） */
  const openTask = (task: WorkTask): void => {
    useAppStore.getState().setPendingLocate({ path: task.path, text: task.text })
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
        {scan !== null && visibleTasks.length > 0 ? <SuggestSection suggestions={suggestions} openTask={openTask} openMapOnly={openMapOnly} /> : null}
        {scan !== null && visibleTasks.length > 0 ? <BoardSection tasks={scan.tasks} onOpen={openTask} /> : null}
      </div>
    </div>
  )
}
