import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { i18n } from '../i18n'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import type { DiffFile } from '../services/gitBackup'

interface Props {
  onClose(): void
}

/** %ci 原始日期（2026-09-06 14:23:45 +0800）→ 本地化显示：ISO 化后经 Intl 按
 *  i18n.language 格式化（调用时求值，语言切换随渲染即时反映）；非常规格式原样兜底 */
const fmtDate = (raw: string): string => {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(raw)
  if (m === null) return raw
  const d = new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`)
  return Number.isNaN(d.getTime())
    ? raw
    : new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(d)
}

/** 版本历史对话框（M22 回滚 UI）：git 仓库最近 50 条提交列表 + 行内确认恢复。
 *  恢复语义：工作区文件整体回到该提交（checkout <hash> -- .），以**新提交**落盘——
 *  历史只增不改，回滚本身可再回滚；未提交变更一并被覆盖（入口在案头，无在途内容）。
 *  M23 恢复预览：行内可展开该版本相对当前的文件级差异（±行数），恢复不再开盲盒 */
export default function HistoryDialog({ onClose }: Readonly<Props>) {
  const list = useAppStore((s) => s.gitHistoryList)
  const restoreVersion = useAppStore((s) => s.restoreVersion)
  const fetchGitHistory = useAppStore((s) => s.fetchGitHistory)
  const diffPreview = useAppStore((s) => s.diffPreview)
  const { t } = useTranslation()
  const title = t('settings.history.title')
  // 行内二次确认态：待确认恢复的 hash；null = 无
  const [confirming, setConfirming] = useState<string | null>(null)
  // 预览展开态（当前展开的 hash）与差异缓存（null=不可得；恢复后 HEAD 变化须失效）
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, { files: DiffFile[]; ins: number; del: number } | null>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchGitHistory()
  }, [fetchGitHistory])

  const doRestore = async (hash: string) => {
    setError(null)
    const err = await restoreVersion(hash)
    if (err !== null) {
      setError(err)
      return
    }
    setConfirming(null)
    // 恢复以新提交落盘 → HEAD 已变，旧差异缓存与展开态全部失效
    setPreviewing(null)
    setPreviews({})
  }

  const togglePreview = async (hash: string) => {
    if (previewing === hash) {
      setPreviewing(null)
      return
    }
    if (previews[hash] === undefined) {
      const stat = await diffPreview(hash)
      setPreviews((p) => ({ ...p, [hash]: stat }))
    }
    setPreviewing(hash)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="history-dialog" aria-label={title} className="sm:max-w-xl">
        <DialogTitle>{title}</DialogTitle>
        <p className="text-xs text-muted-foreground">{t('settings.history.hint')}</p>
        {error !== null && (
          <p data-testid="history-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {/* min-w-0 + viewport 内容容器改 block：truncate 的 nowrap 使长消息 min-content=全文一行宽，
            Radix ScrollArea 的 table 容器(inline style)会把该宽度顶回，撑破对话框(grid item 默认
            min-width:auto)——table 是内联样式故须 !important 压制；两者缺一不可，单改任一仍溢出 */}
        <ScrollArea
          type="hover"
          className="h-80 min-w-0 rounded-md [&_[data-radix-scroll-area-viewport]_div]:block!"
        >
          {list.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground" data-testid="history-empty">
              {t('settings.git.noCommit')}
            </p>
          ) : (
            <ul data-testid="history-list" className="flex flex-col">
              {list.map((h) => (
                <li
                  key={h.hash}
                  data-testid={`history-item-${h.hash}`}
                  className="flex flex-col border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-file text-xs text-muted-foreground">{h.hash}</span>
                    <span className="font-file text-xs text-muted-foreground" title={fmtDate(h.date)}>
                      {fmtDate(h.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={h.message}>
                      {h.message}
                    </span>
                    {confirming === h.hash ? (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          data-testid={`history-confirm-${h.hash}`}
                          onClick={() => void doRestore(h.hash)}
                        >
                          {t('settings.history.confirm')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
                          {t('common.cancel')}
                        </Button>
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          data-testid={`history-preview-${h.hash}`}
                          onClick={() => void togglePreview(h.hash)}
                        >
                          {t('settings.history.preview')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          data-testid={`history-restore-${h.hash}`}
                          onClick={() => setConfirming(h.hash)}
                        >
                          {t('settings.history.restore')}
                        </Button>
                      </>
                    )}
                  </span>
                  {previewing === h.hash && (
                    <DiffBlock stat={previews[h.hash]} hash={h.hash} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="history-close" onClick={onClose}>
            {t('settings.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 行级 diff 展示上限：单文件超此数折叠（防巨型 diff 撑爆对话框）；单行超长截断 */
const MAX_LINES_SHOWN = 30
const MAX_LINE_CHARS = 160

/** 差异展开块（M23 恢复预览）外壳；按态分发见 DiffBody */
function DiffBlock({
  stat,
  hash,
}: Readonly<{
  stat: { files: DiffFile[]; ins: number; del: number } | null | undefined
  hash: string
}>) {
  return (
    <div data-testid={`history-diff-${hash}`} className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
      <DiffBody stat={stat} />
    </div>
  )
}

/** 差异内容按态分发：undefined=加载中、null=不可得、files 空=无差异；
 *  否则汇总行 + 按文件分组的变更行内容（红=恢复后消失，绿=恢复后回来） */
function DiffBody({
  stat,
}: Readonly<{
  stat: { files: DiffFile[]; ins: number; del: number } | null | undefined
}>) {
  const { t } = useTranslation()
  if (stat === undefined) return <p className="text-muted-foreground">{t('settings.history.diffLoading')}</p>
  if (stat === null) return <p className="text-muted-foreground">{t('settings.history.diffUnavailable')}</p>
  if (stat.files.length === 0) return <p className="text-muted-foreground">{t('settings.history.diffNone')}</p>
  return (
    <>
      <p className="text-muted-foreground">
        {t('settings.history.diffFiles', { count: stat.files.length })}
        <span className="text-green-600 dark:text-green-400">+{stat.ins}</span>
        {' / '}
        <span className="text-red-600 dark:text-red-400">-{stat.del}</span>
        {t('settings.history.diffLegend')}
      </p>
      <div className="mt-1 flex flex-col gap-2">
        {stat.files.map((f) => (
          <div key={f.path} data-testid={`history-diff-file-${f.path}`}>
            <p className="flex items-center gap-2">
              <span className="font-file min-w-0 flex-1 truncate" title={f.path}>
                {f.path}
              </span>
              <span className="shrink-0 text-green-600 dark:text-green-400">+{f.ins}</span>
              <span className="shrink-0 text-red-600 dark:text-red-400">-{f.del}</span>
            </p>
            {f.lines.length > 0 && (
              <ul className="mt-0.5 flex flex-col gap-px">
                {f.lines.slice(0, MAX_LINES_SHOWN).map((ln, i) => {
                  const sign = ln.kind === 'add' ? '+' : '-'
                  const isAdd = ln.kind === 'add'
                  const text = ln.text.length > MAX_LINE_CHARS ? `${ln.text.slice(0, MAX_LINE_CHARS)}…` : ln.text
                  return (
                    <li
                      key={`${ln.kind}:${i}:${text}`}
                      className={
                        isAdd
                          ? 'bg-green-500/10 px-1 font-file text-green-700 dark:text-green-400'
                          : 'bg-red-500/10 px-1 font-file text-red-700 dark:text-red-400'
                      }
                      title={ln.text}
                    >
                      {sign}
                      {text}
                    </li>
                  )
                })}
                {f.lines.length > MAX_LINES_SHOWN && (
                  <li className="text-muted-foreground">{t('settings.history.diffMore', { count: f.lines.length - MAX_LINES_SHOWN })}</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
