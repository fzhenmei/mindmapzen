import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { useChatStore } from '../store/chatStore'
import { i18n } from '../i18n'
import { SKILLS } from '../skills'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import AboutDialog from './AboutDialog'
import MobileSyncSection from './MobileSyncSection'
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
 *  提交/推送/致命错误四分支；fatal 已词典化（插值进 backupFailed 模板）；
 *  push 错误串为 git 原文回报，属最终设计，不再迁词典） */
function backupLine(r: BackupOutcome): string {
  if (r.fatal !== null) return i18n.t('settings.git.backupFailed', { reason: r.fatal })
  if (!r.committed) return i18n.t('settings.git.noChange')
  if (r.push.kind === 'ok') return i18n.t('settings.git.committedAndPushed')
  if (r.push.kind === 'error') return i18n.t('settings.git.committedPushFailed', { reason: r.push.message })
  return i18n.t('settings.git.committed')
}

/** 设置对话框（2026-09 手风琴批重整）：五个设置分区（版本管理/快速捕获/手机同步/AI/语言）
 *  收进单展开手风琴——默认全收起，窗口高度稳定不再随分区增长；底部固定区放工作区操作
 *  与「关于」行（版本详情/引导重看/开源地址在 AboutDialog，嵌套叠加本窗之上）。
 *  改动即生效——toggle 直写 store 并 load-merge-save 持久化，无确认按钮，关闭即退出。
 *  M5b 曾有的复制行为两开关于 2026-09 移入砚栏复制钮下拉（经常性取舍不该藏在设置深处）。 */
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
  // Ruling 6：手动备份经 gitRun 端口可 reject（如 git 超时）——不捕则无任何显示；
  // 捕后以 settings.git.backupFailed 包住已本地化的抛错消息（与 fatal 分支同键同位）
  const [backupError, setBackupError] = useState<string | null>(null)
  // AI 对话配置（2026-09 AI Agent v1）：受控草稿 + 显式保存（与 git 分区 onBlur 即存不同，
  // key 三项一次整包提交，保存后短暂提示"已保存"）
  const aiConfig = useAppStore((s) => s.aiConfig)
  const setAiConfig = useAppStore((s) => s.setAiConfig)
  const [aiDraft, setAiDraft] = useState(aiConfig)
  const [aiSaved, setAiSaved] = useState(false)
  const [aiSaveError, setAiSaveError] = useState<string | null>(null)
  // 技能凭据（2026-09 skill 接入，spec §4.6）：遍历 SKILLS 注册表；onBlur 即存（同 git 分区
  // 先例）；保存前快照做「未启用→启用」转变检测，触发引导 notice（spec §4.7）
  const skillsConfig = useAppStore((s) => s.skillsConfig)
  const setSkillApiKey = useAppStore((s) => s.setSkillApiKey)
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({})
  // 快速捕获（2026-09 点子篮子 M2；同年拆分）：快捷键/托盘双开关与快捷键注册失败说明
  const quickCaptureShortcut = useAppStore((s) => s.quickCaptureShortcut)
  const quickCaptureTray = useAppStore((s) => s.quickCaptureTray)
  const setQuickCaptureConfig = useAppStore((s) => s.setQuickCaptureConfig)
  const quickCaptureShortcutError = useAppStore((s) => s.quickCaptureShortcutError)
  const { t } = useTranslation()
  const languagePref = useAppStore((s) => s.languagePref)
  const setLanguagePref = useAppStore((s) => s.setLanguagePref)
  const title = t('settings.title')
  // 关于对话框嵌套态：从底部「关于」行打开，叠在本窗之上（关关于回设置，不动 appStore）
  const [aboutOpen, setAboutOpen] = useState(false)
  // 打开时刷新仓库状态（最近提交/未推送）
  useEffect(() => {
    void useAppStore.getState().refreshGitStatus()
  }, [])

  async function handleAiSave(): Promise<void> {
    setAiSaveError(null)
    try {
      const trimmed = { baseUrl: aiDraft.baseUrl.trim(), apiKey: aiDraft.apiKey.trim(), model: aiDraft.model.trim() }
      await setAiConfig(trimmed)
      setAiDraft(trimmed) // 成功回写草稿，输入框与 store 对齐
      setAiSaved(true)
      window.setTimeout(() => setAiSaved(false), 1600)
    } catch (e) {
      // fs 端口可拒绝（工作区丢失/权限）——保存失败必须显式出口（吞异常禁令）
      console.error('AI 配置保存失败', e)
      setAiSaveError(i18n.t('errors.saveFailed', { reason: String(e) }))
    }
  }

  /** 单个技能凭据 onBlur 即存（2026-09 skill 接入，spec §4.6）：setSkillApiKey 纯存储
   *  异常上抛——失败走 AI 节既有错误出口（同 handleAiSave 判例）。存前快照做「未启用→
   *  启用」转变检测：首次配 key 推编辑器会话引导 notice（spec §4.7） */
  async function handleSkillSave(id: string): Promise<void> {
    // 提交值与显示同口径（草稿优先、回退已存）：未编辑直接失焦重存原值（幂等），不误清凭据
    const key = (skillDrafts[id] ?? useAppStore.getState().skillsConfig[id]?.apiKey ?? '').trim()
    const wasEnabled = (useAppStore.getState().skillsConfig[id]?.apiKey ?? '') !== ''
    try {
      await setSkillApiKey(id, key)
      setSkillDrafts((d) => ({ ...d, [id]: key }))
      if (!wasEnabled && key !== '') {
        const m = SKILLS.find((s) => s.id === id)
        // 引导推编辑器侧会话（spec §4.7）：不进历史不回传；面板未开时存 store，打开即见
        if (m) useChatStore.getState().pushNotice(i18n.t('ai.skill.connected', { name: m.name }), [...m.examples.slice(0, 3)])
      }
    } catch (e) {
      console.error('技能配置保存失败', e)
      setAiSaveError(i18n.t('errors.saveFailed', { reason: String(e) }))
    }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        data-testid="settings-dialog"
        aria-label={title}
        className="max-h-[calc(100vh-4rem)] overflow-y-auto"
      >
        {/* 手风琴后常态高度已收短；max-h+滚动仍兜底（极端矮视口下展开 git+手机同步时
            保 footer 可达，沿 e2e git.spec 实证口径）；细滚动条全局样式自动生效 */}
        <DialogTitle>{title}</DialogTitle>
        {/* 分区 testid 挂在 AccordionTrigger（分区入口）：收起时 Content 不挂载，
            测试/e2e 先点 trigger 展开再操作内部控件 */}
        <div className="flex flex-col gap-2.5 text-sm">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="git">
              <AccordionTrigger data-testid="git-section">{t('settings.git.section')}</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
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
                          <Button
                            variant="secondary"
                            size="sm"
                            data-testid="git-backup-now"
                            onClick={() => {
                              setBackupError(null)
                              void backupNow().catch((e) =>
                                setBackupError(t('settings.git.backupFailed', { reason: e instanceof Error ? e.message : String(e) })),
                              )
                            }}
                          >
                            {t('settings.git.backupNow')}
                          </Button>
                        </span>
                      </div>
                      {backupError !== null && (
                        <p data-testid="git-backup-error" role="alert" className="text-xs text-destructive">
                          {backupError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
            {/* 快速捕获（2026-09 点子篮子 M2，spec §5.1；同年拆分为双开关，均默认关）：快捷键
                与托盘各自独立开闭——绑定行为变更须用户知情自选，不捆绑强推 */}
            <AccordionItem value="quickcapture">
              <AccordionTrigger data-testid="settings-quickcapture-section">{t('basket.quickCapture.title')}</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <label className={SETTING_ROW}>
                    <input
                      type="checkbox"
                      data-testid="quickcapture-shortcut"
                      className="cursor-pointer accent-primary"
                      checked={quickCaptureShortcut}
                      onChange={(e) => void setQuickCaptureConfig({ shortcut: e.target.checked })}
                    />
                    <span>{t('basket.quickCapture.shortcutToggle')}</span>
                  </label>
                  {quickCaptureShortcutError !== null && (
                    <p data-testid="quickcapture-shortcut-error" role="alert" className="text-xs text-destructive">
                      {quickCaptureShortcutError}
                    </p>
                  )}
                  <label className={SETTING_ROW}>
                    <input
                      type="checkbox"
                      data-testid="quickcapture-tray"
                      className="cursor-pointer accent-primary"
                      checked={quickCaptureTray}
                      onChange={(e) => void setQuickCaptureConfig({ tray: e.target.checked })}
                    />
                    <span>{t('basket.quickCapture.trayToggle')}</span>
                  </label>
                  <p className="text-xs text-muted-foreground">{t('basket.quickCapture.hint')}</p>
                </div>
              </AccordionContent>
            </AccordionItem>
            {/* 手机同步（2026-09-26 mobile-capture spec §5.1）：自含分区——内部自取
                get_mobile_sync_info,开关/二维码/IP 选择全在组件内（标题由 trigger 承担） */}
            <AccordionItem value="mobilesync">
              <AccordionTrigger data-testid="settings-mobile-sync-section">{t('mobileSync.title')}</AccordionTrigger>
              <AccordionContent>
                <MobileSyncSection />
              </AccordionContent>
            </AccordionItem>
            {/* AI 对话（2026-09 AI Agent v1，spec §1 BYOK）：三项全填并保存后，编辑视图出现 AI 面板入口 */}
            <AccordionItem value="ai">
              <AccordionTrigger data-testid="settings-ai-section">{t('ai.settings.title')}</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="set-ai-baseurl">{t('ai.settings.baseUrl')}</Label>
                    <Input
                      id="set-ai-baseurl"
                      data-testid="set-ai-baseurl"
                      value={aiDraft.baseUrl}
                      onChange={(e) => setAiDraft({ ...aiDraft, baseUrl: e.target.value })}
                      placeholder={t('ai.settings.baseUrlHint')}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground">{t('ai.settings.baseUrlHint')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="set-ai-key">{t('ai.settings.apiKey')}</Label>
                    <Input
                      id="set-ai-key"
                      data-testid="set-ai-key"
                      type="password"
                      value={aiDraft.apiKey}
                      onChange={(e) => setAiDraft({ ...aiDraft, apiKey: e.target.value })}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground">{t('ai.settings.apiKeyHint')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="set-ai-model">{t('ai.settings.model')}</Label>
                    <Input
                      id="set-ai-model"
                      data-testid="set-ai-model"
                      value={aiDraft.model}
                      onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })}
                      placeholder={t('ai.settings.modelHint')}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" data-testid="set-ai-save" onClick={() => void handleAiSave()}>
                      {t('ai.settings.save')}
                    </Button>
                    {aiSaved && <span className="text-xs text-muted-foreground">{t('ai.settings.saved')}</span>}
                    {aiSaveError !== null && (
                      <p data-testid="set-ai-error" role="alert" className="text-xs text-destructive">
                        {aiSaveError}
                      </p>
                    )}
                  </div>
                  {/* 技能小节（2026-09 skill 接入，spec §4.6）：遍历注册表；配 key 即启用 */}
                  <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                    <p className="text-xs font-medium">{t('ai.settings.skillsTitle')}</p>
                    {SKILLS.map((m) => (
                      <div key={m.id} className="flex flex-col gap-1">
                        <Label htmlFor={`set-skill-${m.id}`}>{m.name}</Label>
                        <p className="text-xs text-muted-foreground">{m.description}</p>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`set-skill-${m.id}`}
                            data-testid={`set-skill-${m.id}`}
                            type="password"
                            value={skillDrafts[m.id] ?? skillsConfig[m.id]?.apiKey ?? ''}
                            onChange={(e) => setSkillDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                            onBlur={() => void handleSkillSave(m.id)}
                            className="text-xs"
                          />
                          {/* 外链走原生 target=_blank：WebView2 对 http 新窗口链接默认交系统浏览器（AboutDialog 先例） */}
                          <a href={m.keyHelpUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-muted-foreground underline">
                            {t('ai.settings.getKey')}
                          </a>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">{t('ai.settings.skillsHint')}</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            {/* 语言三态(2026-09 i18n)：默认跟随系统；显式选择即时生效并持久化 */}
            <AccordionItem value="language">
              <AccordionTrigger data-testid="lang-section">{t('settings.language.label')}</AccordionTrigger>
              <AccordionContent>
                <div className="flex justify-end gap-1">
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
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
          {/* 关于行（2026-09 手风琴批）：版本短摘要留此，详情（commit/引导重看/开源地址）
              进 AboutDialog；__APP_VERSION__/__GIT_COMMIT__ 由 vite define 构建期注入 */}
          <div
            className="mt-1 flex items-center justify-between gap-2 border-t pt-2.5"
            data-testid="about-section"
          >
            <span className="text-xs text-muted-foreground">Mind Map Zen v{__APP_VERSION__}</span>
            <Button variant="secondary" size="sm" data-testid="about-open" onClick={() => setAboutOpen(true)}>
              {t('settings.about')}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="settings-close" onClick={onClose}>
            {t('settings.close')}
          </Button>
        </DialogFooter>
        {aboutOpen && (
          <AboutDialog
            onClose={() => setAboutOpen(false)}
            onReplayTour={() => {
              // 引导遮罩需要完整视口：激活引导并关掉整个设置栈
              useAppStore.getState().startTour()
              onClose()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
