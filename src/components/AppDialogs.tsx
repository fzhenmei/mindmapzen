// src/components/AppDialogs.tsx —— App 级对话框宿主(2026-09 导航系统 spec §6):
// 设置(含二级版本历史)从案头 LibraryDialogs 提升至此,案头/纸面/工作台三空间可达。
// 开合态在 appStore.appDialog(轻量字段);工作区级动作(更换/退出)统一走
// requestWorkspaceAction——编辑器路由(不分脏净,终审修复)记 pending 由 EditorView
// 安全链(AI 回合锁+保存)后执行,其余路由直接执行(执行收口在 store,见
// executeWorkspaceAction 注释)。
import { useAppStore } from '../store/appStore'
import SettingsDialog from './SettingsDialog'
import HistoryDialog from './HistoryDialog'

export default function AppDialogs() {
  const appDialog = useAppStore((s) => s.appDialog)
  const requestWorkspaceAction = useAppStore((s) => s.requestWorkspaceAction)
  return (
    <>
      {appDialog === 'settings' && (
        <SettingsDialog
          onOpenHistory={() => useAppStore.getState().openAppDialog('history')}
          onClose={() => useAppStore.getState().closeAppDialog()}
          onChangeWorkspace={() => requestWorkspaceAction('change')}
          onExitWorkspace={() => requestWorkspaceAction('exit')}
        />
      )}
      {appDialog === 'history' && <HistoryDialog onClose={() => useAppStore.getState().closeAppDialog()} />}
    </>
  )
}
