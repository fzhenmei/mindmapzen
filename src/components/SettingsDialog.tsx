import ZenDialog from './ZenDialog'
import { useAppStore } from '../store/appStore'

interface SettingsDialogProps {
  onClose(): void
}

/** 设置对话框（M5b Task 4）：复制行为两开关（checkbox 形式）。
 *  改动即生效——toggle 直写 store 并 load-merge-save 持久化，无确认按钮，关闭即退出 */
export default function SettingsDialog({ onClose }: Readonly<SettingsDialogProps>) {
  const settings = useAppStore((s) => s.settings)
  const setSetting = useAppStore((s) => s.setSetting)
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
        复制时包含备注
      </label>
      <label className="setting-row">
        <input
          type="checkbox"
          data-testid="copy-links-toggle"
          checked={settings.copyIncludeLinks}
          onChange={(e) => void setSetting('copyIncludeLinks', e.target.checked)}
        />
        复制时保留双链标记
      </label>
    </ZenDialog>
  )
}
