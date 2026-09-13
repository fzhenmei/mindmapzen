import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { joinPath } from '../services/workspace'
import { repoNameFromUrl } from '../services/gitClone'

/** 克隆请求载荷（LibraryView 完成克隆+设工作区） */
export interface CloneRequest {
  url: string
  username: string
  password: string
  parentDir: string
}

interface Props {
  /** 父目录选择：生产为 Tauri 目录对话框（App 装配经 LibraryView 注入）；取消返回 null */
  pickDirectory(): Promise<string | null>
  /** 确认：完成克隆与设工作区；resolve = 成功（调用方关框）；抛错 = 对话框就地显示
   *  error.message、不关框（NewMapDialog 同契约——输入类错误不散落全局 banner） */
  onConfirm(req: CloneRequest): Promise<void>
  onCancel(): void
}

/** 「从 Git 库打开」克隆对话框：Git 库地址 + 可选用户名/密码（私有库 basic auth 内嵌）+
 *  克隆位置（浏览选父目录，实时预览目标路径 <父目录>/<仓库名>）。克隆为网络长操作：
 *  busy 态锁对话框（禁关闭/禁按钮 + 文案切「正在克隆…」），超时兜底在 Rust 侧（600s） */
export default function CloneDialog({ pickDirectory, onConfirm, onCancel }: Readonly<Props>) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [parentDir, setParentDir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 仓库名实时派生（URL 尾段去 .git）——预览目标路径；解析不出则预览空占位
  const repoName = repoNameFromUrl(url)
  const target = parentDir !== '' && repoName !== '' ? joinPath(parentDir, repoName) : ''

  const browse = async () => {
    // 异步回调入口（React 合成事件）自兜异常：pickDirectory 抛错就地显示，不静默
    try {
      const dir = await pickDirectory()
      if (dir !== null) setParentDir(dir)
    } catch (e) {
      setError(String(e))
    }
  }

  const confirm = async () => {
    if (busy || url.trim() === '' || parentDir === '') return
    setBusy(true)
    setError(null)
    try {
      await onConfirm({ url, username, password, parentDir })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const submitKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void confirm()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onCancel() }}>
      <DialogContent aria-label={t('library.dialogs.clone.title')}>
        <DialogTitle>{t('library.dialogs.clone.title')}</DialogTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-url">{t('library.dialogs.clone.url')}</Label>
            <Input
              id="clone-url"
              data-testid="clone-url"
              placeholder={t('library.dialogs.clone.urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={submitKey}
              autoFocus
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clone-user">{t('library.dialogs.clone.username')}</Label>
            <Input
              id="clone-user"
              data-testid="clone-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={submitKey}
              disabled={busy}
            />
            <Label htmlFor="clone-pass">{t('library.dialogs.clone.password')}</Label>
            <Input
              id="clone-pass"
              data-testid="clone-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={submitKey}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t('library.dialogs.clone.location')}</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="clone-browse"
                onClick={() => void browse()}
                disabled={busy}
              >
                {t('library.dialogs.clone.browse')}
              </Button>
              <span data-testid="clone-parent" className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {parentDir}
              </span>
            </div>
            <p data-testid="clone-target" className="text-xs text-muted-foreground">
              {target !== '' ? t('library.dialogs.clone.targetPreview', { path: target }) : ''}
            </p>
          </div>
          {error !== null && (
            <p data-testid="dialog-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            data-testid="btn-confirm"
            onClick={() => void confirm()}
            disabled={busy || url.trim() === '' || parentDir === ''}
          >
            {busy ? t('library.dialogs.clone.cloning') : t('library.dialogs.clone.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
