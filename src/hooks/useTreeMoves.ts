// src/hooks/useTreeMoves.ts —— 案头树移动收口（2026-09）：右键对话框流与树拖拽流共用。
//  moveFile = moveMap 语义（目标重名自动时间后缀，同对话框流）；moveDir = 整子树一步
//  rename（目标下重名 / 落自身子孙由服务层守卫拒绝报错）。移动后的刷新（maps 重扫 +
//  左树重读 + 预览 prune）由调用方注入——本 hook 不持有树 state；错误统一 setError toast。
//  收藏跟随（2026-09 收藏置顶）：两流在移动成功后 relocate（moveFile 单址换 / moveDir
//  前缀重写），保住「永远置顶」——改名/移动不丢星标
import { useAppStore } from '../store/appStore'
import { i18n } from '../i18n'
import { isUnderDir, moveDir as moveDirOnFs, moveMap } from '../services/desk'
import { joinPath, resolveDir } from '../services/workspace'

interface TreeMoves {
  /** 移动导图（.md + sidecar 两文件同移）到目标目录；同目录无操作 */
  moveFile(name: string, fromRel: string, toRel: string): Promise<void>
  /** 移动目录整子树；选中目录在被移子树内时前缀随迁（选中不悬空） */
  moveDir(fromRel: string, toRel: string): Promise<void>
}

export function useTreeMoves(refresh: () => Promise<void>): TreeMoves {
  const moveFile = async (name: string, fromRel: string, toRel: string) => {
    const { adapter, workspaceDir, setError } = useAppStore.getState()
    if (workspaceDir === null || toRel === fromRel) return
    try {
      const info = await moveMap(adapter, workspaceDir, name, fromRel, toRel)
      // 收藏换址（返回值含重名自动后缀后的最终名，不误随旧名）
      await useAppStore.getState().relocateFavorite(joinPath(resolveDir(workspaceDir, fromRel), name + '.md'), info.mdPath)
      await refresh()
      setError(null)
    } catch (e) {
      setError(i18n.t('errors.moveFailed', { reason: e instanceof Error ? e.message : String(e) }))
    }
  }
  const moveDir = async (fromRel: string, toRel: string) => {
    const { adapter, workspaceDir, setError, selectedDir, setSelectedDir } = useAppStore.getState()
    if (workspaceDir === null || toRel === fromRel) return
    try {
      await moveDirOnFs(adapter, workspaceDir, fromRel, toRel)
      // 被移子树根的新前缀 = 目标路径 + 被移目录名（toRel='' 上提只留名）；选中行深于
      // fromRel 的部分原样接后——选中随子树平移，不悬空不丢
      const name = fromRel.split('/').at(-1) ?? fromRel
      const newRel = toRel === '' ? name : `${toRel}/${name}`
      // 收藏前缀重写：子树内收藏 mdPath 随迁（未收藏子树 no-op 不写盘）
      await useAppStore.getState().relocateFavoritesUnder(resolveDir(workspaceDir, fromRel), resolveDir(workspaceDir, newRel))
      if (isUnderDir(selectedDir, fromRel)) {
        setSelectedDir(selectedDir === fromRel ? newRel : newRel + selectedDir.slice(fromRel.length))
      }
      await refresh()
      setError(null)
    } catch (e) {
      setError(i18n.t('errors.moveFailed', { reason: e instanceof Error ? e.message : String(e) }))
    }
  }
  return { moveFile, moveDir }
}
