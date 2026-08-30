import { useAppStore } from '../store/appStore'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface SettingsDialogProps {
  onClose(): void
  /** 更换工作区入口（M5d 缓期项清偿）：案头设置页内的目录选择流（pickDirectory）；
   *  未注入则隐藏该行（如测试单独渲染） */
  onChangeWorkspace?: () => void
  /** 退出工作区入口（v0.7.0 验收）：清 workspaceDir 回开屏页；未注入则隐藏该行 */
  onExitWorkspace?: () => void
}

/** 开关行（M12b Task 5 转 utility）：checkbox 走 primary 强调色 */
const SETTING_ROW = 'flex cursor-pointer select-none items-center gap-2'

/** 设置对话框（M5b Task 4）：复制行为两开关（checkbox 形式）。
 *  改动即生效——toggle 直写 store 并 load-merge-save 持久化，无确认按钮，关闭即退出。
 *  M5d 增「更换工作区」行（M5a 缓期项：无工作区切换入口）；
 *  v0.7.0 增「退出工作区（回到开屏）」行 */
export default function SettingsDialog({ onClose, onChangeWorkspace, onExitWorkspace }: Readonly<SettingsDialogProps>) {
  const settings = useAppStore((s) => s.settings)
  const setSetting = useAppStore((s) => s.setSetting)
  const workspaceDir = useAppStore((s) => s.workspaceDir) // 更换工作区行显示当前路径
  const title = '设置'
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent data-testid="settings-dialog" aria-label={title} className="w-90 gap-3 p-5">
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
