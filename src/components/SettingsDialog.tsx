import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface SettingsDialogProps {
  onClose(): void
  /** 更换工作区入口（M5d 缓期项清偿）：案头设置页内的目录选择流（pickDirectory）；
   *  未注入则隐藏该行（如测试单独渲染） */
  onChangeWorkspace?: () => void
  /** 退出工作区入口（v0.7.0 验收）：清 workspaceDir 回开屏页；未注入则隐藏该行 */
  onExitWorkspace?: () => void
  /** 版本历史入口（M22）：打开历史/回滚对话框；未注入则隐藏该钮 */
  onOpenHistory?: () => void
}

/** 开关行（M12b Task 5 转 utility）：checkbox 走 primary 强调色 */
const SETTING_ROW = 'flex cursor-pointer select-none items-center gap-2'

/** git 状态摘要文案（Sonar S3358/S4624 修复：拆平 JSX 内嵌套三元与嵌套模板字面量） */
function gitStatusLine(s: { lastCommit: string | null; aheadCount: number | null }): string {
  if (s.lastCommit === null) return '尚无提交'
  const ahead = s.aheadCount ? ` · 未推送 ${s.aheadCount}` : ''
  return `最近提交：${s.lastCommit}${ahead}`
}

/** 设置对话框（M5b Task 4）：复制行为两开关（checkbox 形式）。
 *  改动即生效——toggle 直写 store 并 load-merge-save 持久化，无确认按钮，关闭即退出。
 *  M5d 增「更换工作区」行（M5a 缓期项：无工作区切换入口）；
 *  v0.7.0 增「退出工作区（回到开屏）」行 */
export default function SettingsDialog({ onClose, onChangeWorkspace, onExitWorkspace, onOpenHistory }: Readonly<SettingsDialogProps>) {
  const settings = useAppStore((s) => s.settings)
  const setSetting = useAppStore((s) => s.setSetting)
  const workspaceDir = useAppStore((s) => s.workspaceDir) // 更换工作区行显示当前路径
  // 版本管理（M20 想法8）：启用开关/远程配置/状态/手动备份
  const gitConfig = useAppStore((s) => s.gitConfig)
  const setGitConfig = useAppStore((s) => s.setGitConfig)
  const backupNow = useAppStore((s) => s.backupNow)
  const lastBackup = useAppStore((s) => s.lastBackup)
  const gitStatus = useAppStore((s) => s.gitStatus)
  const [remoteUrl, setRemoteUrl] = useState(gitConfig.remoteUrl ?? '')
  const [token, setToken] = useState(gitConfig.token ?? '')
  const title = '设置'
  // 打开时刷新仓库状态（最近提交/未推送）
  useEffect(() => {
    void useAppStore.getState().refreshGitStatus()
  }, [])
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="settings-dialog" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <div className="flex flex-col gap-2.5 text-sm">
          <label className={SETTING_ROW}>
            <input
              type="checkbox"
              data-testid="copy-note-toggle"
              className="cursor-pointer accent-primary"
              checked={settings.copyIncludeNote}
              onChange={(e) => void setSetting('copyIncludeNote', e.target.checked)}
            />
            <span>复制时包含备注</span>
          </label>
          <label className={SETTING_ROW}>
            <input
              type="checkbox"
              data-testid="copy-links-toggle"
              className="cursor-pointer accent-primary"
              checked={settings.copyIncludeLinks}
              onChange={(e) => void setSetting('copyIncludeLinks', e.target.checked)}
            />
            <span>复制时保留双链标记</span>
          </label>
          <div className="mt-1 flex flex-col gap-2 border-t pt-2.5" data-testid="git-section">
            <label className={SETTING_ROW}>
              <input
                type="checkbox"
                data-testid="git-enabled-toggle"
                className="cursor-pointer accent-primary"
                checked={gitConfig.enabled}
                onChange={(e) => void setGitConfig({ enabled: e.target.checked })}
              />
              <span>版本管理（自动提交到工作区 git 仓库）</span>
            </label>
            {gitConfig.enabled && (
              <>
                <Input
                  data-testid="git-remote-input"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  onBlur={() => void setGitConfig({ remoteUrl: remoteUrl.trim() === '' ? null : remoteUrl.trim() })}
                  placeholder="远程仓库 HTTPS 地址（留空仅本地提交）"
                  className="text-xs"
                />
                <Input
                  data-testid="git-token-input"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onBlur={() => void setGitConfig({ token: token.trim() === '' ? null : token.trim() })}
                  placeholder="访问令牌（PAT，私有仓库需要）"
                  className="text-xs"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground" data-testid="git-status" title={gitStatus.lastCommit ?? undefined}>
                    {gitStatusLine(gitStatus)}
                    {lastBackup !== null ? ` · ${lastBackup}` : ''}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {onOpenHistory && (
                      <Button variant="secondary" size="sm" data-testid="git-history-open" onClick={onOpenHistory}>
                        历史
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" data-testid="git-backup-now" onClick={() => void backupNow()}>
                      立即备份
                    </Button>
                  </span>
                </div>
              </>
            )}
          </div>
          {onChangeWorkspace && (
            <div className="flex items-center justify-between gap-2">
              <span>工作区：{workspaceDir ?? '未设置'}</span>
              <Button
                variant="secondary"
                size="sm"
                data-testid="settings-workspace-change"
                onClick={onChangeWorkspace}
              >
                更换工作区
              </Button>
            </div>
          )}
          {onExitWorkspace && (
            <div className="flex items-center justify-between gap-2">
              <span>退出工作区（回到开屏）</span>
              <Button variant="secondary" size="sm" data-testid="settings-workspace-exit" onClick={onExitWorkspace}>
                退出
              </Button>
            </div>
          )}
          {/* 关于区（2026-09 版本信息批）：产品名 + 版本 + commit 短哈希——
              __APP_VERSION__/__GIT_COMMIT__ 由 vite define 构建期注入（vite.config.ts） */}
          <div
            className="mt-1 flex items-center justify-between gap-2 border-t pt-2.5"
            data-testid="about-section"
          >
            <span className="text-xs text-muted-foreground">
              Mind Map Zen v{__APP_VERSION__} · {__GIT_COMMIT__}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="settings-close" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
