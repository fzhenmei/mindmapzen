import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import type { DiffFile } from '../services/gitBackup'

interface Props {
  onClose(): void
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
      <DialogContent data-testid="history-dialog" aria-label="版本历史" className="sm:max-w-xl">
        <DialogTitle>版本历史</DialogTitle>
        <p className="text-xs text-muted-foreground">最近 50 次提交；恢复以新提交落盘，可再次回滚</p>
        {error !== null && (
          <p data-testid="history-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <ScrollArea className="h-80 rounded-md">
          {list.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground" data-testid="history-empty">
              尚无提交
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
                    <span className="font-file text-xs text-muted-foreground" title={h.date}>
                      {h.date.replace(/ \+\d+$/, '')}
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
                          确认恢复
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
                          取消
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
                          预览
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          data-testid={`history-restore-${h.hash}`}
                          onClick={() => setConfirming(h.hash)}
                        >
                          恢复
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
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 差异展开块（M23 恢复预览）：undefined=加载中、null=不可得、files 空=无差异；
 *  否则汇总行 + 文件行（±行数，红绿为 diff 惯例色） */
function DiffBlock({
  stat,
  hash,
}: Readonly<{
  stat: { files: DiffFile[]; ins: number; del: number } | null | undefined
  hash: string
}>) {
  return (
    <div data-testid={`history-diff-${hash}`} className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
      {stat === undefined ? (
        <p className="text-muted-foreground">差异加载中…</p>
      ) : stat === null ? (
        <p className="text-muted-foreground">差异不可得</p>
      ) : stat.files.length === 0 ? (
        <p className="text-muted-foreground">与当前版本无差异</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            恢复后 {stat.files.length} 个文件变更（+{stat.ins} / -{stat.del} 行）
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {stat.files.map((f) => (
              <li key={f.path} className="flex items-center gap-2">
                <span className="font-file min-w-0 flex-1 truncate" title={f.path}>
                  {f.path}
                </span>
                <span className="shrink-0 text-green-600 dark:text-green-400">+{f.ins}</span>
                <span className="shrink-0 text-red-600 dark:text-red-400">-{f.del}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
