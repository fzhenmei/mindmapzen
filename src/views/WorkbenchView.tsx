// src/views/WorkbenchView.tsx —— 工作台（驾驶舱）：跨图任务聚合总览（spec 2026-09-13）。
// 只读 + 跳转（spec §1）：一切编辑回纸面做，本视图不写任何文件。纵向构图（§4）：
// 头部 → 下一步建议区 → 聚合看板 → 最近（Task 5/6 逐区完整化）。
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { scanWorkTasks, WORK_DIR, type WorkScan } from '../services/workbench'
import { joinPath } from '../services/workspace'

export default function WorkbenchView() {
  const { t } = useTranslation()
  const adapter = useAppStore((s) => s.adapter)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const backToLibrary = useAppStore((s) => s.backToLibrary)
  const [scan, setScan] = useState<WorkScan | null>(null)
  const [scanning, setScanning] = useState(true)

  /** 即时聚合（spec §1）：每次进入/触发全量重扫，离开即弃。顶层 catch 是防御性
   *  第二出口（单文件失败已在服务层收进 failed）——不吞异常，留 console.error 线索 */
  const rescan = useCallback(async (): Promise<void> => {
    if (workspaceDir === null) return
    setScanning(true)
    try {
      setScan(await scanWorkTasks(adapter, workspaceDir))
    } catch (e) {
      console.error('工作台聚合失败', e)
      setScan({ dirExists: false, maps: [], tasks: [], failed: [] })
    } finally {
      setScanning(false)
    }
  }, [adapter, workspaceDir])

  useEffect(() => {
    void rescan()
  }, [rescan])

  const createWorkDir = async (): Promise<void> => {
    try {
      await adapter.ensureDir(joinPath(workspaceDir ?? '', WORK_DIR))
    } catch (e) {
      console.error('创建工作目录失败', e)
      return
    }
    await rescan()
  }

  return (
    <div className="flex h-full flex-col bg-background" data-testid="workbench-view">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold">{t('workbench.title')}</h1>
        <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => void backToLibrary()}>
          {t('workbench.toLibrary')}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {scanning && scan === null ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground" data-testid="workbench-loading">
            {t('workbench.scanning')}
          </div>
        ) : scan !== null && scan.failed.length > 0 ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive" data-testid="workbench-failed-bar">
            {t('workbench.failedBar', { count: scan.failed.length })}：{scan.failed.join('、')}
          </div>
        ) : null}
        {scan !== null && !scan.dirExists ? (
          <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center">
            <p className="font-medium">{t('workbench.empty.noDirTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('workbench.empty.noDirBody')}</p>
            <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" data-testid="workbench-empty-create" onClick={() => void createWorkDir()}>
              {t('workbench.empty.create')}
            </button>
          </div>
        ) : null}
        {scan !== null && scan.dirExists && scan.tasks.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">{t('workbench.empty.noTasks')}</p>
        ) : null}
        {scan !== null && scan.tasks.length > 0 ? (
          <div>
            <p className="text-sm text-muted-foreground">{t('workbench.board.section')}</p>
            {/* 占位任务列表（Task 5 替换为完整看板区）：key 必须拼 mapPath——临时 uid
                仅图内唯一，跨图会重复（见 services/workbench.ts assignUids 注释） */}
            {scan.tasks.map((x) => (
              <span key={`${x.mapPath}#${x.uid}`}>{x.text}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
