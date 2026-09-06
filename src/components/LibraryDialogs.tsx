// src/components/LibraryDialogs.tsx —— 案头对话框容器（2026-09 行数护栏拆自 LibraryView，
// 零行为变化）：新建/设置/历史/重命名/新建目录/删除目录/删除/移动/导入预览九框 JSX
// 原样迁入。状态与业务确认在 useLibraryDialogs（api），本容器纯展示——开态即 api.dialog。
// 对话框互斥约定（ui Dialog）：dialog 与 importPreview 互不并存——Radix Dialog 为
// modal（遮罩挡背景 + 滚动锁定），两条入口天然互斥。
import { useTranslation } from 'react-i18next'
import type { LibraryDialogsApi } from '../hooks/useLibraryDialogs'
import type { DirNode } from '../services/desk'
import type { MapInfo } from '../types/files'
import { dirDeleteSummary } from '../services/desk'
import NameDialog from './NameDialog'
import SettingsDialog from './SettingsDialog'
import HistoryDialog from './HistoryDialog'
import NewMapDialog from './NewMapDialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'
import ImportPreviewDialog from './ImportPreviewDialog'
import MoveMapDialog from './MoveMapDialog'

interface Props {
  api: LibraryDialogsApi
  /** 整目录删除确认框报导图数（实时取自 maps，用户知情） */
  maps: MapInfo[]
  /** 移动对话框的目录树 */
  tree: DirNode[]
}

export default function LibraryDialogs({ api, maps, tree }: Readonly<Props>) {
  const { t } = useTranslation()
  const { dialog, target, dirTarget, importPreview, newMapDir, dirParent } = api
  return (
    <>
      {/* 新建导图（M16 换 NewMapDialog）：名称 + 模板选择；四个入口（页首 btn-new/
          空态 library-empty-new/欢迎页 desk-idle-new/树目录行右键 ctx-btn-new-map）
          共用本对话框——右键入口带目标目录（标题示目录、落盘建在彼处） */}
      {dialog === 'new' && (
        <NewMapDialog
          inDirLabel={newMapDir === '' ? undefined : newMapDir}
          onCancel={api.closeDialog}
          onConfirm={api.confirmCreateMap}
        />
      )}
      {/* 设置对话框（M5b Task 4 + M5d 更换工作区 + v0.7.0 退出工作区）：与其他对话框共用
          dialog 互斥状态；更换工作区先关对话框再走 pickDirectory 流（同开屏「创建工作区」）；
          退出工作区清 store 落 workspaceDir:null 回开屏页（无工作区分支渲染 WelcomeScreen） */}
      {dialog === 'settings' && (
        <SettingsDialog
          onOpenHistory={api.onOpenHistory}
          onClose={api.closeDialog}
          onChangeWorkspace={api.onChangeWorkspace}
          onExitWorkspace={api.onExitWorkspace}
        />
      )}
      {/* 版本历史/回滚（M22）：从设置页打开（Radix modal 互斥，settings 先关再开本框） */}
      {dialog === 'history' && <HistoryDialog onClose={api.closeDialog} />}
      {dialog === 'rename' && target && (
        <NameDialog
          title={t('library.dialogs.rename.title')}
          initial={target.name}
          confirmText={t('common.rename')}
          onCancel={api.closeDialog}
          onConfirm={api.confirmRename}
        />
      )}
      {dialog === 'newdir' && (
        <NameDialog
          title={dirParent === '' ? t('library.dialogs.newDir.title') : t('library.dialogs.newDir.titleIn', { dir: dirParent })}
          confirmText={t('library.dialogs.newDir.confirm')}
          onCancel={api.closeDialog}
          onConfirm={(name) => void api.confirmCreateDir(name)}
        />
      )}
      {/* 删除目录（2026-09 树右键）：整目录进回收站——内含导图数实时取自 maps（确认框
          报数）；删除后选中目录若在被删子树内则回根视图（api.confirmDeleteDir 收口） */}
      {dialog === 'deletedir' && dirTarget && (
        <DeleteConfirmDialog
          title={t('library.dialogs.deleteDir.title', { name: dirTarget.name })}
          body={dirDeleteSummary(maps, tree, dirTarget.rel)}
          onCancel={api.closeDialog}
          onConfirm={() => api.confirmDeleteDir(dirTarget.rel)}
        />
      )}
      {dialog === 'delete' && target && (
        <DeleteConfirmDialog
          title={t('library.dialogs.deleteMap.title', { name: target.name })}
          body={t('library.dialogs.deleteMap.body')}
          onCancel={api.closeDialog}
          onConfirm={() => void api.confirmDelete()}
        />
      )}
      {dialog === 'move' && target && (
        <MoveMapDialog
          mapName={target.name}
          tree={tree}
          fromRel={target.relDir}
          onCancel={api.cancelMove}
          onMove={(toRel) => void api.moveTarget(toRel)}
        />
      )}
      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onCancel={api.closeImportPreview}
          onConfirm={() => void api.confirmImport()}
        />
      )}
    </>
  )
}
