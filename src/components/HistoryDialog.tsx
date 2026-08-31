import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'

interface Props {
  onClose(): void
}

/** 版本历史对话框（M22 回滚 UI）：git 仓库最近 50 条提交列表 + 行内确认恢复。
 *  恢复语义：工作区文件整体回到该提交（checkout <hash> -- .），以**新提交**落盘——
 *  历史只增不改，回滚本身可再回滚；未提交变更一并被覆盖（入口在案头，无在途内容） */
export default function HistoryDialog({ onClose }: Readonly<Props>) {
  const list = useAppStore((s) => s.gitHistoryList)
  const restoreVersion = useAppStore((s) => s.restoreVersion)
  const fetchGitHistory = useAppStore((s) => s.fetchGitHistory)
  // 行内二次确认态：待确认恢复的 hash；null = 无
  const [confirming, setConfirming] = useState<string | null>(null)
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
                  className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                >
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
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      data-testid={`history-restore-${h.hash}`}
                      onClick={() => setConfirming(h.hash)}
                    >
                      恢复
                    </Button>
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
