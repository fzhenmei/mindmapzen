// src/components/BasketSortPanel.tsx —— 一屏批量整理（spec §4.3）：清单逐行选目标 / 丢弃，
// 底部批量挂载。先写目标图、成功后再删篮子（反序会两边都没有）；逐条独立成败，
// 结果面板列出失败原因 + 撤销本次挂载（会话级，反向操作）。loadIdeas/backup 由
// EditorView 注入（引擎树数据源 / git 备份端口），组件不摸引擎不摸 git
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import BasketTargetPicker from './BasketTargetPicker'
import { useAppStore } from '../store/appStore'
import { mountIdea, unmountIdea, type MountFailReason, type MountTarget } from '../services/basketMount'
import { showToast } from '../services/toast'
import { askPlacement, MAX_MAPS_FOR_AI } from '../services/ai/ideaPlacement'
import { getTransport } from '../services/ai/client'
import { basketAbsPath, type BasketIdea } from '../services/basket'
import { i18n } from '../i18n'

interface Props {
  open: boolean
  onClose(): void
  /** 引擎 renderTree → parseBasketIdeasFromEngine（EditorView 注入） */
  loadIdeas(): BasketIdea[]
  /** 挂载前 git 备份（一次提交一次；未启用版本管理时注入空实现） */
  backup(): Promise<void>
}

interface RowState {
  idea: BasketIdea
  target: MountTarget | null
}

/** 失败行：挂载失败原因 ∪「已挂载但篮子未清理」 */
type FailRow = { text: string; reason: MountFailReason | 'removeBasket' }

/** 已挂载条目（撤销的数据源）。basketCleared = 篮子条目确已摘除——false 表示该条**从未离开篮子**
 *  （removeBasketIdeaByText 失败），撤销时只摘目标图、跳过 captureIdea，否则凭空多插一条重复 */
interface MountedRow {
  target: MountTarget
  idea: BasketIdea
  basketCleared: boolean
}

/** 失败原因词条 key（字面量联合）：消费端 t(...) 的 key 空间由此收紧（i18next 严格类型） */
type FailLabelKey =
  | 'basket.sort.failTargetNotFound'
  | 'basket.sort.failMapMissing'
  | 'basket.sort.failDepthTooDeep'
  | 'basket.sort.failWriteFailed'
  | 'basket.sort.failRemoveBasket'

const FAIL_LABEL_KEY: Record<MountFailReason | 'removeBasket', FailLabelKey> = {
  targetNotFound: 'basket.sort.failTargetNotFound',
  mapMissing: 'basket.sort.failMapMissing',
  depthTooDeep: 'basket.sort.failDepthTooDeep',
  writeFailed: 'basket.sort.failWriteFailed',
  removeBasket: 'basket.sort.failRemoveBasket',
}

/** 路径尾段去 .md（《图名》显示） */
function basenameOf(mdPath: string): string {
  const seg = mdPath.split(/[\\/]/).pop() ?? mdPath
  return seg.replace(/\.md$/i, '')
}

export default function BasketSortPanel({ open, onClose, loadIdeas, backup }: Readonly<Props>) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<RowState[]>([])
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState<FailRow[] | null>(null)
  const [mounted, setMounted] = useState<MountedRow[]>([])
  const [resultOpen, setResultOpen] = useState(false)

  // ── AI 推荐（M3，spec §6）：AI 只读不写，产出仅预填目标，落盘仍走上面 M1 挂载管线 ──
  const aiConfig = useAppStore((s) => s.aiConfig)
  // BYOK 判定：三项全非空（同 DeskOverview 口径）；未配 → AI 钮全禁用 + 说明行，手动整理不受影响
  const aiReady = aiConfig.baseUrl !== '' && aiConfig.apiKey !== '' && aiConfig.model !== ''
  // aiBusy 独立于 busy：AI 运行中挂载钮/单行推荐禁用（防预填与挂载竞态），反之亦然
  const [aiBusy, setAiBusy] = useState(false)
  const aiAbortRef = useRef<(() => void) | null>(null)
  // 最新已提交 rows 的镜像：runAi 是 async 回合，收尾时闭包里的 rows 是回合开始前的快照
  //（AI 运行期间用户可能已手选/清除/丢弃）——预填的可填集与计数都以最新态计算
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // loadIdeas 是 EditorView 的内联箭头（每次渲染都是新身份）：触发只认 open，实现经 ref 取最新——
  // 否则宿主任何无关重渲染都会重扫清单，把用户已选的目标与结果面板一起冲掉
  // （spec §4.3「重开重扫」= 重开才扫，非每次渲染都扫）
  const loadRef = useRef(loadIdeas)
  useEffect(() => {
    loadRef.current = loadIdeas
  }, [loadIdeas])

  // 打开即扫描（重开重扫，选择状态不持久——spec §4.3）
  useEffect(() => {
    if (!open) return
    setRows(loadRef.current().map((idea) => ({ idea, target: null })))
    setFailures(null)
    setMounted([])
    setResultOpen(false)
  }, [open])

  // 关闭/卸载兜底掐流（DeskOverview 先例）：浮层 close 与 unmount 都不再需要流，防孤儿流
  useEffect(() => {
    if (!open) aiAbortRef.current?.()
  }, [open])
  useEffect(() => () => aiAbortRef.current?.(), [])

  const selected = useMemo(() => rows.filter((r) => r.target !== null), [rows])

  const mountAll = async (): Promise<void> => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    try {
      await backup()
      const fs = useAppStore.getState().adapter
      const okRows: MountedRow[] = []
      const failRows: FailRow[] = []
      for (const row of selected) {
        const target = row.target
        if (target === null) continue
        const r = await mountIdea(fs, target, row.idea)
        if (!r.ok) {
          failRows.push({ text: row.idea.text, reason: r.reason })
          continue
        }
        // 先写目标图、成功后才删篮子（spec §4.5 执行顺序）；删除失败该条目标图已有、
        // 仅篮子未清——记 removeBasket 显式告知，不静默；basketCleared 供撤销决定是否恢复篮子
        const rm = await useAppStore.getState().removeBasketIdeaByText(row.idea.text)
        if (!rm.ok) failRows.push({ text: row.idea.text, reason: 'removeBasket' })
        okRows.push({ target, idea: row.idea, basketCleared: rm.ok })
      }
      setMounted(okRows)
      setFailures(failRows)
      // 已写入目标图的行一律移出清单（篮子清没清都算已挂载——留下会被「挂载全部已选」再挂一次，
      // 目标图出现重复子节点）；只有**未写入**（挂载失败）的行留在原位供改选重试
      setRows((prev) => prev.filter((r) => r.target === null || failRows.some((f) => f.text === r.idea.text && f.reason !== 'removeBasket')))
      setResultOpen(true)
    } catch (e) {
      // 出口：结果面板（写入失败行）+ 日志留线索。挂在 backup/mountIdea 的非预期抛出上——
      // 两者契约上恒以结果对象返回，走到这里即 bug，中断处可能有条目已落盘（回看清单可核对）
      console.error('篮子批量挂载异常', e)
      setFailures([{ text: '', reason: 'writeFailed' }])
      setResultOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const undoAll = async (): Promise<void> => {
    // 并发闸（终审 M3）：连点两次会并发跑两轮、共用同一 mounted 快照——第二轮 unmountIdea 报
    // targetNotFound（面板停留显示假失败），且两轮各自 captureIdea → 篮子多出重复点子。
    // busy 与「挂载全部已选」共用（同一时刻只有一个批量动作在跑）：按钮 disabled 是主闸
    //（React 离散事件各自 flush，第二击必落在已重渲染的 disabled 钮上），此闸兜其他调用入口
    //（同一 render 的闭包读到的 busy 仍是旧值，挡不住同一 tick 的重入——不依赖它）
    if (busy) return
    setBusy(true)
    try {
      const fs = useAppStore.getState().adapter
      const fails: FailRow[] = []
      const pending: MountedRow[] = [] // 摘除失败（目标图节点仍在）的条目：留在 mounted 供重试
      for (const m of mounted) {
        const r = await unmountIdea(fs, m.target, m.idea)
        if (!r.ok) {
          fails.push({ text: m.idea.text, reason: r.reason })
          pending.push(m)
          continue
        }
        // 篮子从没摘掉过的条目（basketCleared=false）**跳过**恢复：再 captureIdea 会凭空多插一条
        //（captureIdea 无去重、removeBasketIdeaByText 只删首个 → 残留永久重复），它本就在篮子里即天然正确
        if (!m.basketCleared) continue
        // 篮子恢复走 §4.2 就近引擎管线；失败同列失败行——目标图节点已删而篮子没回来
        // 就是「两边都没有」，必须显式告知而非静默（spec §4.6 逐条独立成败）
        const back = await useAppStore.getState().captureIdea(m.idea)
        if (!back.ok) fails.push({ text: m.idea.text, reason: 'writeFailed' })
      }
      setMounted(pending)
      setFailures(fails)
      // 有失败即保持面板打开：逐条原因必须看得见（关掉就只剩 toast 的数量），
      // 且 mounted 保住的条目可重试；全成功才关闭
      setResultOpen(fails.length > 0)
      showToast(fails.length === 0 ? t('basket.sort.undone') : t('basket.sort.resultFail', { n: fails.length }))
      setRows(loadRef.current().map((idea) => ({ idea, target: null })))
    } catch (e) {
      // 出口：结果面板（写入失败行）+ 日志留线索。undoAll 经 void 即发即弃，不兜就是无声的
      // unhandled rejection；管线契约上恒以结果对象返回，走到这里即 bug
      console.error('篮子撤销挂载异常', e)
      setFailures([{ text: '', reason: 'writeFailed' }])
      setResultOpen(true)
    } finally {
      setBusy(false)
    }
  }

  const discard = async (idea: BasketIdea): Promise<void> => {
    try {
      const r = await useAppStore.getState().removeBasketIdeaByText(idea.text)
      if (!r.ok) {
        // 出口：日志留线索（失败串来自 §4.2 管线；行保持原样 = 本次丢弃未生效）
        console.error('丢弃点子失败', idea.text, r.error)
        return
      }
      setRows((prev) => prev.filter((x) => x.idea.text !== idea.text))
    } catch (e) {
      // 出口：全局错误横幅 + 日志（同 void 即发即弃，不能无声）
      console.error('丢弃点子异常', idea.text, e)
      useAppStore.getState().setError(t('basket.errors.writeFailed'))
    }
  }

  /** AI 推荐并预填（spec §6.1/§6.3）：单行/一键共用。AI 只读不写——产出仅预填
   *  target（不落盘），失败行不填留给手选；落盘仍由用户确认后的挂载管线执行 */
  const runAi = async (ideas: BasketIdea[]): Promise<void> => {
    if (aiBusy || busy || !aiReady || ideas.length === 0) return
    const st = useAppStore.getState()
    // 篮子自身不可作目标（同 picker 口径，按绝对路径排除）；maps 传绝对路径
    //（st.maps 的 mdPath 恒绝对路径——台账契约：勿做相对拼接）
    const basketAbs = st.workspaceDir !== null && st.basketRelPath !== null ? basketAbsPath(st.workspaceDir, st.basketRelPath) : null
    const maps = st.maps.map((m) => m.mdPath).filter((m) => m !== basketAbs)
    const transport = getTransport()
    aiAbortRef.current = (): void => transport.abort()
    setAiBusy(true)
    try {
      const r = await askPlacement(
        { ideas, maps, ai: st.aiConfig, workspaceDir: st.workspaceDir!, fs: st.adapter },
        { transport },
      )
      if (!r.ok) {
        if (r.error === 'aborted') return // 本地掐流非故障（DeskOverview 先例），静默回 idle
        // 出口：console 线索 + toast（可重试——按钮回 idle 即在）
        console.error('AI 推荐失败', r.error, r.message ?? '')
        if (r.error === 'tooManyMaps') showToast(i18n.t('basket.sort.aiTooManyMaps', { n: MAX_MAPS_FOR_AI }))
        else if (r.error === 'parseFailed') showToast(i18n.t('basket.sort.aiParseFailed'))
        else showToast(i18n.t('basket.sort.aiRequestFailed'))
        return
      }
      const unmatched = r.rows.filter((x) => 'failed' in x).length
      // 预填只进「当前仍无目标」的行（spec §6.3 预填语义，不覆盖手选）。可填集依 rowsRef
      //（最新已提交 rows）在 updater 外算好：计数若放函数式 updater 里——React 异步渲染下
      // 紧随其后的 toast 会读到 0，StrictMode 双调 updater 还会双计；updater 内再按 index+
      // 文本复核，快照与实际行序若错位（期间丢弃等）宁可不填也不错位填
      const cur = rowsRef.current
      const fills = new Map<number, MountTarget>()
      for (const row of r.rows) {
        if (!('target' in row)) continue
        const i = cur.findIndex((p) => p.idea.text === row.idea.text && p.target === null)
        if (i !== -1) fills.set(i, row.target)
      }
      if (fills.size > 0) {
        setRows((prev) =>
          prev.map((p, j) => {
            const target = fills.get(j)
            return target !== undefined && p.target === null && cur[j]?.idea.text === p.idea.text ? { ...p, target } : p
          }),
        )
      }
      showToast(i18n.t('basket.sort.aiDone', { n: fills.size }))
      if (unmatched > 0) showToast(i18n.t('basket.sort.aiUnmatched', { n: unmatched }))
    } catch (e) {
      // 出口：toast + console（runAi 经 void 即发即弃，兜非预期抛出——不兜就是无声 unhandled rejection）
      console.error('AI 推荐异常', e)
      showToast(i18n.t('basket.sort.aiRequestFailed'))
    } finally {
      // 回合收尾即摘除 abort 句柄（对齐 DeskOverview/ChatPanel 口径）：流已结束，
      // close/卸载不再触发过期的 transport.abort()
      aiAbortRef.current = null
      setAiBusy(false)
    }
  }

  if (!open) return null
  return (
    <div data-testid="basket-sort" className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
      <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent aria-label={t('basket.sort.title')} className="sm:max-w-2xl">
          {/* 标题带条数：「整理篮子 (N)」（spec §4.3 顶部要件） */}
          <DialogTitle>{t('basket.sort.title')} ({rows.length})</DialogTitle>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('basket.sort.empty')}</p>
          ) : (
            <ul className="max-h-[50vh] overflow-auto">
              {rows.map((row, i) => (
                <li key={`${row.idea.text}-${i}`} data-testid="sort-row" className="flex items-center gap-2 border-b py-2 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-sm">{row.idea.text}</span>
                  {row.target === null ? (
                    <>
                      <Button variant="ghost" size="sm" data-testid="sort-pick" onClick={() => setPickerFor(i)}>
                        {t('basket.sort.pickTarget')}
                      </Button>
                      {/* 单行推荐（spec §6.1）：仅无目标行显示；BYOK 未配/任一批量在跑时禁用 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="sort-ai-row"
                        disabled={!aiReady || aiBusy || busy}
                        onClick={() => void runAi([row.idea])}
                      >
                        {t('basket.sort.aiRow')}
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* 点目标列 = 重选（spec §4.3）；清除另设一键回到未选态。
                          列内显示**节点路径**（spec §4.3「《图名》› 节点路径」）：target.path 含根文本
                          （picker flatten 以 [tree.text] 起链），slice(1) 去根后拼上节点自身文本 */}
                      <button
                        type="button"
                        className="max-w-[40%] truncate text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPickerFor(i)}
                      >
                        《{basenameOf(row.target.mapPath)}》› {[...row.target.path.slice(1), row.target.text].join(' › ')}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="sort-clear"
                        onClick={() => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, target: null } : r)))}
                      >
                        {t('basket.sort.clearTarget')}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" data-testid="sort-discard" onClick={() => void discard(row.idea)}>
                    {t('basket.sort.discard')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {/* BYOK 未配说明行（spec §6.1）：AI 钮全禁用时给出原因与去处，手动整理不受影响 */}
          {!aiReady && rows.length > 0 && (
            <p data-testid="sort-ai-disabled-note" className="text-xs text-muted-foreground">
              {t('basket.sort.aiDisabledNote')}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            {/* AI 区（spec §6.1）：idle 一键整理 / 运行中 [推荐中…] + 停止（互斥显示）。
                一键只对无目标的行跑（有目标 = 用户手选，AI 不碰）；挂载运行中禁用（防预填与挂载竞态） */}
            {aiBusy ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('basket.sort.aiRunning')}</span>
                <Button variant="secondary" size="sm" data-testid="sort-ai-stop" onClick={() => aiAbortRef.current?.()}>
                  {t('basket.sort.aiStop')}
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                data-testid="sort-ai-all"
                disabled={!aiReady || busy}
                onClick={() => void runAi(rows.filter((r) => r.target === null).map((r) => r.idea))}
              >
                {t('basket.sort.aiAll')}
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t('basket.sort.close')}
              </Button>
              <Button
                size="sm"
                data-testid="sort-mount-selected"
                disabled={selected.length === 0 || busy || aiBusy}
                onClick={() => void mountAll()}
              >
                {/* 底部钮带已选条数（spec §4.3「挂载全部已选 (M)」）；busy 态文案不变；AI 运行中禁用 */}
                {busy ? t('basket.sort.mounting') : `${t('basket.sort.mountSelected')} (${selected.length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {pickerFor !== null && (
        <BasketTargetPicker
          open
          onClose={() => setPickerFor(null)}
          onPick={(target) => {
            setRows((prev) => prev.map((r, i) => (i === pickerFor ? { ...r, target } : r)))
            setPickerFor(null)
          }}
        />
      )}
      {resultOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setResultOpen(false) }}>
          <DialogContent aria-label={t('basket.sort.resultTitle')} className="sm:max-w-md">
            <div data-testid="sort-result">
              <DialogTitle>{t('basket.sort.resultTitle')}</DialogTitle>
              <p className="text-sm">{t('basket.sort.resultOk', { n: mounted.length })}</p>
              {failures !== null && failures.length > 0 && (
                <ul className="text-sm text-destructive">
                  {failures.map((f, i) => (
                    <li key={`${f.reason}-${f.text}-${i}`}>
                      {f.text !== '' && `${f.text}：`}
                      {t(FAIL_LABEL_KEY[f.reason])}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex justify-end gap-2">
                {mounted.length > 0 && (
                  <Button variant="secondary" size="sm" data-testid="sort-undo" disabled={busy} onClick={() => void undoAll()}>
                    {t('basket.sort.undo')}
                  </Button>
                )}
                <Button size="sm" onClick={() => setResultOpen(false)}>
                  {t('basket.sort.close')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
