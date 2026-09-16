// src/hooks/useLibraryDialogs.ts —— 案头对话框集群状态机（2026-09 行数护栏拆自 LibraryView，
// 零行为变化）：dialog/target/dirTarget/importPreview/newMapDir/dirParent 六态 + 各框开关
// 与业务确认（导入/新建导图/新建目录/重命名/删除/目录删除/移动）。视图级联动（选中清理/
// 左树重读）经 deps 注入——本 hook 不持有树与选中态（同 useTreeMoves 约定）。
import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { i18n } from '../i18n'
import { deleteMap, renameMap, joinPath, resolveDir } from '../services/workspace'
import { commitImport } from '../services/importMap'
import { createDir, deleteDir } from '../services/desk'
import { parse } from '../services/mdTree'
import { parseXmind } from '../services/xmindImport'
import type { MapAction } from '../components/DetailActions'
import type { ImportPreview } from '../components/ImportPreviewDialog'
import type { MapInfo } from '../types/files'
import type { IgnoredBlock, ZenNode } from '../types/tree'

/** 导入源统一载荷（M21：md 文本 / xmind 字节双流，一个对话框入口按 kind 分流；
 *  可辨识联合——分支内 text/bytes 精确收窄） */
export type PickedImport =
  | { name: string; kind: 'md'; text: string }
  | { name: string; kind: 'xmind'; bytes: Uint8Array }

/** 对话框互斥态（ui Dialog modal 语义：至多同时一个；与 importPreview 亦互斥）。
 *  设置/历史已迁 AppDialogs（2026-09 导航系统），此处只余案头文件操作框群 */
export type DialogKind = 'new' | 'rename' | 'delete' | 'deletedir' | 'move' | 'newdir' | null

/** 视图联动依赖（hook 不持有的态与回调，全部由 LibraryView 注入） */
export interface LibraryDialogsDeps {
  /** 外部导入源选择（生产为 Tauri 对话框 + adapter 读取，测试注入桩；取消返回 null） */
  pickImportFile(): Promise<PickedImport | null>
  /** 重读左树（目录增删/移动取消后还原真实盘态） */
  reloadTree(): Promise<void>
  /** 选中态失效清理（重命名/删除/移动后，maps 已刷新时调用） */
  pruneSelectedMap(): void
  /** 整目录删除后的选中回落（选中目录在被删子树内 → 回根视图） */
  onDirRemoved(rel: string): void
  /** 树移动（useTreeMoves.moveFile；移动对话框确认收口） */
  moveFile(name: string, fromRel: string, toRel: string): Promise<void>
}

/** 对话框集群对外 API：状态只读快照（容器组装各框）+ 开关意图（视图按钮/右键直呼）
 *  + 业务确认（各框 onConfirm） */
export interface LibraryDialogsApi {
  readonly dialog: DialogKind
  /** 重命名/删除/移动对话框当前操作的导图（由文件行右键/详情页首动作钮选定） */
  readonly target: MapInfo | null
  /** 删除目录对话框目标（rel 相对工作区，name 末段显示名） */
  readonly dirTarget: { rel: string; name: string } | null
  readonly importPreview: ImportPreview | null
  /** 新建导图目标目录（''=工作区根） */
  readonly newMapDir: string
  /** 新建目录的父目录（''=工作区根） */
  readonly dirParent: string
  /** 关框全清（target/dirTarget 同清；对无目标的框等价于仅关框——互斥态下无副作用） */
  closeDialog(): void
  closeImportPreview(): void
  /** 打开新建导图对话框（rel = 目标目录；常驻入口传 ''，树右键传所在目录） */
  openNewMap(rel: string): void
  openNewDir(rel: string): void
  /** 文件行右键/详情页首动作：带目标导图开对应框 */
  openMapAction(a: MapAction, m: MapInfo): void
  openDeleteDir(rel: string): void
  /** 导入（.md / .xmind）：复制入库（内容按规范序列化另存，不移动原文件）；
   *  有未映射内容先预览确认（md 解析忽略块 / xmind 游离主题等摘要，同一通道） */
  startImport(): Promise<void>
  confirmImport(): Promise<void>
  confirmCreateMap(name: string, templateContent: string): Promise<void>
  /** 新建目录（desk.createDir 递归，'/' 分隔逐段校验）。M16 抛错语义：错误抛给
   *  NameDialog 框内显示，成功路径才关框 */
  confirmCreateDir(name: string): Promise<void>
  /** 重命名导图。M16 抛错语义同上（失败留框内显示，成功才关框） */
  confirmRename(name: string): Promise<void>
  /** 删除导图进回收站（.md 与 .zen.json 一起）；失败走全局横幅 */
  confirmDelete(): Promise<void>
  /** 整目录进回收站（fire-and-forget，失败走全局横幅）；选中回落经 deps.onDirRemoved */
  confirmDeleteDir(rel: string): void
  /** 移动对话框确认：关框后走 deps.moveFile（刷新/收藏换址在 useTreeMoves） */
  moveTarget(toRel: string): void
  /** 移动对话框取消：也重读左树——对话框内联新建的目录已真实落盘，不能只留在
   *  对话框暂存列表（Esc 经 ui Dialog onOpenChange(false) 同走 onCancel，语义一致） */
  cancelMove(): void
}

export function useLibraryDialogs(deps: Readonly<LibraryDialogsDeps>): LibraryDialogsApi {
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [target, setTarget] = useState<MapInfo | null>(null)
  const [dirTarget, setDirTarget] = useState<{ rel: string; name: string } | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [dirParent, setDirParent] = useState('')
  const [newMapDir, setNewMapDir] = useState('')

  const closeDialog = () => {
    setDialog(null)
    setTarget(null)
    setDirTarget(null)
  }

  const startImport = async () => {
    const { workspaceDir, adapter, preferredLayout, setError, openMap } = useAppStore.getState()
    if (!workspaceDir) return
    try {
      const picked = await deps.pickImportFile()
      if (picked === null) return
      // 统一产出 { tree, blocks }：md 走 parse；xmind 走 ZIP 解析（M21）
      let tree: ZenNode
      let blocks: IgnoredBlock[]
      if (picked.kind === 'md') {
        const r = parse(picked.text)
        if (!r.ok) {
          setError(i18n.t('errors.importFailed', { reason: r.error }))
          return
        }
        tree = r.tree
        blocks = r.ignoredBlocks
      } else {
        const r = parseXmind(picked.bytes)
        tree = r.tree
        blocks = r.warnings
      }
      if (blocks.length > 0) {
        setImportPreview({ name: picked.name, tree, blocks })
        return
      }
      const info = await commitImport(adapter, workspaceDir, picked.name, tree, preferredLayout)
      await openMap(info.mdPath)
    } catch (e) {
      useAppStore.getState().setError(i18n.t('errors.importFailed', { reason: String(e) }))
    }
  }

  const confirmImport = async () => {
    const pending = importPreview
    const { workspaceDir, adapter, preferredLayout, setError, openMap } = useAppStore.getState()
    if (pending === null || !workspaceDir) return
    setImportPreview(null)
    try {
      const info = await commitImport(adapter, workspaceDir, pending.name, pending.tree, preferredLayout)
      await openMap(info.mdPath)
    } catch (e) {
      setError(i18n.t('errors.importFailed', { reason: String(e) }))
    }
  }

  const confirmCreateMap = async (name: string, templateContent: string) => {
    await useAppStore.getState().createAndOpen(name, templateContent, newMapDir)
    setDialog(null)
  }

  const confirmCreateDir = async (name: string) => {
    const { adapter, workspaceDir } = useAppStore.getState()
    if (!workspaceDir) return
    await createDir(adapter, workspaceDir, dirParent === '' ? name : `${dirParent}/${name}`)
    await deps.reloadTree()
    setDialog(null)
  }

  const confirmRename = async (name: string) => {
    const t = target
    const { adapter, workspaceDir } = useAppStore.getState()
    if (t === null || workspaceDir === null) return
    await renameMap(adapter, workspaceDir, t.relDir, t.name, name)
    // 收藏跟随换址（2026-09）：改名即换 mdPath，先 relocate 再刷新（星标不随改名丢失）
    await useAppStore.getState().relocateFavorite(
      t.mdPath,
      joinPath(resolveDir(workspaceDir, t.relDir), name.trim() + '.md'),
    )
    await useAppStore.getState().refreshMaps()
    deps.pruneSelectedMap()
    closeDialog()
  }

  const confirmDelete = async () => {
    const t = target
    if (t === null) return
    const store = useAppStore.getState()
    closeDialog()
    try {
      await deleteMap(store.adapter, store.workspaceDir!, t.relDir, t.name)
      await store.refreshMaps()
      deps.pruneSelectedMap()
    } catch (e) {
      store.setError(i18n.t('errors.deleteFailed', { reason: String(e) }))
    }
  }

  const confirmDeleteDir = (rel: string) => {
    closeDialog()
    void (async () => {
      const store = useAppStore.getState()
      try {
        await deleteDir(store.adapter, store.workspaceDir!, rel)
        await store.refreshMaps()
        await deps.reloadTree()
        deps.pruneSelectedMap()
        deps.onDirRemoved(rel)
        store.setError(null)
      } catch (e) {
        store.setError(i18n.t('errors.deleteDirFailed', { reason: e instanceof Error ? e.message : String(e) }))
      }
    })()
  }

  const moveTarget = (toRel: string) => {
    const t = target
    if (t === null) return
    closeDialog()
    void deps.moveFile(t.name, t.relDir, toRel)
  }

  const cancelMove = () => {
    closeDialog()
    void deps.reloadTree()
  }

  const openNewMap = (rel: string) => {
    setNewMapDir(rel)
    setDialog('new')
  }
  const openNewDir = (rel: string) => {
    setDirParent(rel)
    setDialog('newdir')
  }
  const openMapAction = (a: MapAction, m: MapInfo) => {
    setTarget(m)
    setDialog(a)
  }
  const openDeleteDir = (rel: string) => {
    const segs = rel.split('/')
    setDirTarget({ rel, name: segs.at(-1) ?? rel })
    setDialog('deletedir')
  }

  return {
    dialog,
    target,
    dirTarget,
    importPreview,
    newMapDir,
    dirParent,
    closeDialog,
    closeImportPreview: () => setImportPreview(null),
    openNewMap,
    openNewDir,
    openMapAction,
    openDeleteDir,
    startImport,
    confirmImport,
    confirmCreateMap,
    confirmCreateDir,
    confirmRename,
    confirmDelete,
    confirmDeleteDir,
    moveTarget,
    cancelMove,
  }
}
