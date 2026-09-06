import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { i18n } from '../i18n'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { BackupOutcome } from '../services/gitBackup'

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

/** git 状态摘要文案（Sonar S3358/S4624 修复：拆平 JSX 内嵌套三元与嵌套模板字面量；
 *  函数在组件外，翻译走 i18n.t 而非 useTranslation 的 t） */
function gitStatusLine(s: { lastCommit: string | null; aheadCount: number | null }): string {
  if (s.lastCommit === null) return i18n.t('settings.git.noCommit')
  const ahead = s.aheadCount ? i18n.t('settings.git.ahead', { count: s.aheadCount }) : ''
  return i18n.t('settings.git.lastCommit', { commit: s.lastCommit }) + ahead
}

/** 备份结果摘要（2026-09 i18n：store 只存 BackupOutcome 原始数据，人话在此拼——
 *  提交/推送/致命错误四分支；fatal 与 push 错误串为服务层原文，Task 10 迁移） */
function backupLine(r: BackupOutcome): string {
  if (r.fatal !== null) return i18n.t('settings.git.backupFailed', { reason: r.fatal })
  if (!r.committed) return i18n.t('settings.git.noChange')
  if (r.push.kind === 'ok') return i18n.t('settings.git.committedAndPushed')
  if (r.push.kind === 'error') return i18n.t('settings.git.committedPushFailed', { reason: r.push.message })
  return i18n.t('settings.git.committed')
}

/** 设置对话框：版本管理（git 自动备份）开关与状态、功能引导、工作区管理。
 *  M5b 曾有的复制行为两开关于 2026-09 移入砚栏复制钮下拉（经常性取舍不该藏在设置深处）。
 *  改动即生效——toggle 直写 store 并 load-merge-save 持久化，无确认按钮，关闭即退出。
 *  M5d 增「更换工作区」行（M5a 缓期项：无工作区切换入口）；
 *  v0.7.0 增「退出工作区（回到开屏）」行 */
export default function SettingsDialog({ onClose, onChangeWorkspace, onExitWorkspace, onOpenHistory }: Readonly<SettingsDialogProps>) {
  const workspaceDir = useAppStore((s) => s.workspaceDir) // 更换工作区行显示当前路径
  // 版本管理（M20 想法8）：启用开关/远程配置/状态/手动备份
  const gitConfig = useAppStore((s) => s.gitConfig)
  const setGitConfig = useAppStore((s) => s.setGitConfig)
  const backupNow = useAppStore((s) => s.backupNow)
  const lastBackup = useAppStore((s) => s.lastBackup)
  const gitStatus = useAppStore((s) => s.gitStatus)
  const [remoteUrl, setRemoteUrl] = useState(gitConfig.remoteUrl ?? '')
  const [token, setToken] = useState(gitConfig.token ?? '')
  const { t } = useTranslation()
  const languagePref = useAppStore((s) => s.languagePref)
  const setLanguagePref = useAppStore((s) => s.setLanguagePref)
  const title = t('settings.title')
  // 打开时刷新仓库状态（最近提交/未推送）
  useEffect(() => {
    void useAppStore.getState().refreshGitStatus()
  }, [])
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="settings-dialog" aria-label={title}>
        <DialogTitle>{title}</DialogTitle>
        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex flex-col gap-2" data-testid="git-section">
            <label className={SETTING_ROW}>
              <input
                type="checkbox"
                data-testid="git-enabled-toggle"
                className="cursor-pointer accent-primary"
                checked={gitConfig.enabled}
                onChange={(e) => void setGitConfig({ enabled: e.target.checked })}
              />
              <span>{t('settings.git.toggle')}</span>
            </label>
            {gitConfig.enabled && (
              <>
                <Input
                  data-testid="git-remote-input"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  onBlur={() => void setGitConfig({ remoteUrl: remoteUrl.trim() === '' ? null : remoteUrl.trim() })}
                  placeholder={t('settings.git.remotePlaceholder')}
                  className="text-xs"
                />
                <Input
                  data-testid="git-token-input"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onBlur={() => void setGitConfig({ token: token.trim() === '' ? null : token.trim() })}
                  placeholder={t('settings.git.tokenPlaceholder')}
                  className="text-xs"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground" data-testid="git-status" title={gitStatus.lastCommit ?? undefined}>
                    {gitStatusLine(gitStatus)}
                    {lastBackup !== null ? ` · ${backupLine(lastBackup)}` : ''}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {onOpenHistory && (
                      <Button variant="secondary" size="sm" data-testid="git-history-open" onClick={onOpenHistory}>
                        {t('settings.git.history')}
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" data-testid="git-backup-now" onClick={() => void backupNow()}>
                      {t('settings.git.backupNow')}
                    </Button>
                  </span>
                </div>
              </>
            )}
          </div>
          {/* 语言三态(2026-09 i18n)：默认跟随系统；显式选择即时生效并持久化 */}
          <div className="flex items-center justify-between gap-2" data-testid="lang-section">
            <span>{t('settings.language.label')}</span>
            <span className="flex shrink-0 gap-1">
              {(['auto', 'zh-CN', 'en'] as const).map((p) => (
                <Button
                  key={p}
                  variant={languagePref === p ? 'default' : 'secondary'}
                  size="sm"
                  data-testid={`lang-${p === 'zh-CN' ? 'zh' : p}`}
                  onClick={() => void setLanguagePref(p)}
                >
                  {t(`settings.language.${p === 'zh-CN' ? 'zh' : p}`)}
                </Button>
              ))}
            </span>
          </div>
          {/* 漫游引导重看（2026-09 onboarding tour，spec §6）：点击激活引导并关设置——遮罩需要完整视口 */}
          <div className="flex items-center justify-between gap-2">
            <span>{t('settings.tourReplay')}</span>
            <Button
              variant="secondary"
              size="sm"
              data-testid="tour-replay"
              onClick={() => {
                useAppStore.getState().startTour()
                onClose()
              }}
            >
              {t('settings.tourReplayBtn')}
            </Button>
          </div>
          {onChangeWorkspace && (
            <div className="flex items-center justify-between gap-2">
              <span>{t('settings.workspaceRow', { dir: workspaceDir ?? t('settings.workspaceUnset') })}</span>
              <Button
                variant="secondary"
                size="sm"
                data-testid="settings-workspace-change"
                onClick={onChangeWorkspace}
              >
                {t('settings.changeWorkspace')}
              </Button>
            </div>
          )}
          {onExitWorkspace && (
            <div className="flex items-center justify-between gap-2">
              <span>{t('settings.exitWorkspace')}</span>
              <Button variant="secondary" size="sm" data-testid="settings-workspace-exit" onClick={onExitWorkspace}>
                {t('settings.exitBtn')}
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
            {t('settings.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
