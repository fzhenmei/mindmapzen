import ZenDialog from './ZenDialog'
import { useAppStore } from '../store/appStore'

interface SettingsDialogProps {
  onClose(): void
  /** 更换工作区入口（M5d 缓期项清偿）：案头设置页内的目录选择流（pickDirectory）；
   *  未注入则隐藏该行（如测试单独渲染） */
  onChangeWorkspace?: () => void
}

/** 设置对话框（M5b Task 4）：复制行为两开关（checkbox 形式）。
 *  改动即生效——toggle 直写 store 并 load-merge-save 持久化，无确认按钮，关闭即退出。
 *  M5d 增「更换工作区」行（M5a 缓期项：无工作区切换入口） */
export default function SettingsDialog({ onClose, onChangeWorkspace }: Readonly<SettingsDialogProps>) {
  const settings = useAppStore((s) => s.settings)
  const setSetting = useAppStore((s) => s.setSetting)
  const workspaceDir = useAppStore((s) => s.workspaceDir) // 更换工作区行显示当前路径
  return (
    <ZenDialog
      testid="settings-dialog"
      title="设置"
      onClose={onClose}
      actions={
        <button type="button" data-testid="settings-close" onClick={onClose}>
          关闭
        </button>
      }
    >
      <label className="setting-row">
        <input
          type="checkbox"
          data-testid="copy-note-toggle"
          checked={settings.copyIncludeNote}
          onChange={(e) => void setSetting('copyIncludeNote', e.target.checked)}
        />
        <span>复制时包含备注</span>
      </label>
      <label className="setting-row">
        <input
          type="checkbox"
          data-testid="copy-links-toggle"
          checked={settings.copyIncludeLinks}
          onChange={(e) => void setSetting('copyIncludeLinks', e.target.checked)}
        />
        <span>复制时保留双链标记</span>
      </label>
      {onChangeWorkspace && (
        <div className="setting-row setting-workspace">
          <span>工作区：{workspaceDir ?? '未设置'}</span>
          <button type="button" data-testid="settings-workspace-change" onClick={onChangeWorkspace}>
            更换工作区
          </button>
        </div>
      )}
    </ZenDialog>
  )
}
