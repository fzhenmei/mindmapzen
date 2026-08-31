// src/hooks/useQuickSwitch.ts —— 快速切换（v2.5 编辑器内切换导图，拆自 EditorView 行数护栏）：
// Ctrl+P 浮层候选派生（跨会话 recentOpened）、Ctrl+Tab ping-pong（会话 sessionRecent）、
// 安全切换链 leaveTo（与「返回案头」共用：暂停自动保存 → 显式保存 → 成功才导航）。
import { useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { SwitchCandidate } from '../components/QuickSwitchDialog'
import type { SavePipeline } from './useSavePipeline'

interface Params {
  /** 当前图路径（同图切换 no-op；候选排除当前图） */
  mdPath: string
  /** 工作区根（候选目录字段派生；编辑器路由必在工作区内，类型上防御 null） */
  workspaceDir: string | null
  /** 保存管线（切换链前暂停自动保存） */
  pipeline: Pick<SavePipeline, 'clearPendingAutosave'>
  /** 显式保存链（EditorView 的 explicitSave，未映射块确认门内含） */
  explicitSave(): Promise<boolean>
}

export function useQuickSwitch({ mdPath, workspaceDir, pipeline, explicitSave }: Readonly<Params>) {
  const [switchOpen, setSwitchOpen] = useState(false)

  /** 离开当前图的安全链（返回案头/快速切换共用）：暂停自动保存 → 显式保存 → 成功才导航；
   *  保存失败/确认挂起留在原图 */
  const leaveTo = async (navigate: () => Promise<void>): Promise<void> => {
    pipeline.clearPendingAutosave()
    if (await explicitSave()) await navigate()
  }

  /** 快速切换：终点 openMap 目标图（同图 no-op；父组件按 mdPath key 重挂载，切换天然干净） */
  const switchTo = async (target: string): Promise<void> => {
    if (target === mdPath) return
    setSwitchOpen(false)
    await leaveTo(() => useAppStore.getState().openMap(target))
  }

  /** Ctrl+Tab ping-pong：切到会话 MRU 首个非当前图（无则 no-op；回案头再开新图的轨迹也在 MRU 里） */
  const pingPong = (): void => {
    const prev = useAppStore.getState().sessionRecent.find((p) => p !== mdPath)
    if (prev !== undefined) void switchTo(prev)
  }

  // Ctrl+P 浮层候选：recentOpened（跨会话 MRU，含上次会话）排除当前图 → 名/目录展示字段
  const recentOpened = useAppStore((s) => s.recentOpened)
  const candidates = useMemo<SwitchCandidate[]>(() => {
    if (workspaceDir === null) return []
    return recentOpened
      .filter((p) => p !== mdPath)
      .map((p) => {
        const rest = p.startsWith(workspaceDir + '/') ? p.slice(workspaceDir.length + 1) : p
        const seg = rest.split('/')
        return { mdPath: p, name: seg.pop()!.replace(/\.md$/, ''), dir: seg.join('/') }
      })
  }, [recentOpened, mdPath, workspaceDir])

  return { switchOpen, open: () => setSwitchOpen(true), close: () => setSwitchOpen(false), candidates, switchTo, pingPong, leaveTo }
}
