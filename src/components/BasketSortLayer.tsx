// src/components/BasketSortLayer.tsx —— 整理浮层装配（spec §4.3）：BasketSortPanel 的两个注入端口
// （loadIdeas 引擎数据源 / backup git 备份）在此组装，EditorView 只渲染一行（行数护栏，同
// basketEngine.ts 的抽离动因）。组件不摸引擎内部也不摸 git：句柄经 mmRef 取当前引擎、
// git 接线经 store 取；BasketSortPanel 本身只认两个回调
import type { RefObject } from 'react'
import BasketSortPanel from './BasketSortPanel'
import { useAppStore } from '../store/appStore'
import { parseBasketIdeasFromEngine } from '../services/basket'
import { showToast } from '../services/toast'
import { i18n } from '../i18n'
import type { EngineNode, MindMapHandle } from '../types/engine'

/** 未启用版本管理的挂载告知（会话级一次，spec §4.5）：模块级标志——浮层/宿主重挂不重置 */
let gitNoticeShown = false

interface Props {
  open: boolean
  onClose(): void
  /** 当前引擎句柄（EditorView 的 mmRef，与篮子引擎端口同源；未就绪为 null） */
  mmRef: RefObject<MindMapHandle | null>
}

export default function BasketSortLayer({ open, onClose, mmRef }: Readonly<Props>) {
  return (
    <BasketSortPanel
      open={open}
      onClose={onClose}
      // 数据源 = 引擎根的数据子节点（renderer.root.nodeData.children，与 renderTree 同源：
      // 含未保存改动、含收起子树）。引擎类型面未声明 nodeData（那是节点实例的真实字段，
      // 见 services/basket.parseBasketIdeasFromEngine 注），在此显式转换一次交给其窄类型；
      // 引擎未就绪返回空表（面板出空态，不误导）
      loadIdeas={() => {
        const root = mmRef.current?.renderer?.root as unknown as
          | { nodeData?: { children?: EngineNode[] } }
          | null
          | undefined
        return root === null || root === undefined ? [] : parseBasketIdeasFromEngine(root)
      }}
      // 挂载前备份（一次提交一次；未启用版本管理时给会话级一次信息卡，不静默——spec §4.5）。
      // 备份是「能回滚」的支点：失败不阻断挂载（挂载本身逐条独立成败），但必须留痕。
      // 落地走 store.backupNow（终审 M4）：checkAndBackup 以 BackupOutcome **结果对象**返回
      // （不抛），此处直接调它等于丢弃结果——备份真失败时用户无提示、lastBackup 也无记录；
      // backupNow 与设置页手动备份/定时器同通道，结果落 lastBackup + 刷新仓库状态，
      // 启用判定也随之下沉到一处（这里只为「未启用」提示留判据）
      backup={async () => {
        const { gitRun, gitConfig, workspaceDir, backupNow } = useAppStore.getState()
        if (gitRun === null || !gitConfig.enabled || workspaceDir === null) {
          if (!gitNoticeShown) {
            gitNoticeShown = true
            showToast(i18n.t('basket.gitOffNotice'))
          }
          return
        }
        await backupNow()
      }}
    />
  )
}
