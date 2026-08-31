// src/hooks/useQuickSwitch.ts —— 快速切换（v2.5 编辑器内切换导图，拆自 EditorView 行数护栏）：
// Ctrl+P 搜索浮层（跨会话 recentOpened）、Ctrl+Tab 按住轮换（会话 sessionRecent，VS Code 手法：
// 呼出列表 → 连按 Tab 循环高亮 → 松 Ctrl 落定，一按即松 = ping-pong）、
// 安全切换链 leaveTo（与「返回案头」共用：暂停自动保存 → 显式保存 → 成功才导航）。
import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** 轮换态：高亮索引；null = 未开（Ctrl+Tab 轮换期间受控驱动浮层） */
  const [cycle, setCycle] = useState<number | null>(null)
  const cycleRef = useRef<number | null>(null)
  cycleRef.current = cycle // 渲染期同步（全局监听闭包读最新值，同 anyDialogRef 手法）

  /** 路径 → 展示候选（搜索/轮换两模式共用的 name/dir 派生） */
  const toCandidate = (p: string): SwitchCandidate => {
    const rest = workspaceDir !== null && p.startsWith(workspaceDir + '/') ? p.slice(workspaceDir.length + 1) : p
    const seg = rest.split('/')
    return { mdPath: p, name: seg.pop()!.replace(/\.md$/, ''), dir: seg.join('/') }
  }

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
    setCycle(null)
    await leaveTo(() => useAppStore.getState().openMap(target))
  }

  // Ctrl+P 搜索候选：recentOpened（跨会话 MRU，含上次会话）排除当前图
  const recentOpened = useAppStore((s) => s.recentOpened)
  const candidates = useMemo<SwitchCandidate[]>(
    () => recentOpened.filter((p) => p !== mdPath).map(toCandidate),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toCandidate 依赖 workspaceDir（props 稳定于本视图生命周期）
    [recentOpened, mdPath, workspaceDir],
  )

  // Ctrl+Tab 轮换候选：sessionRecent（会话内严格 MRU——「最近在用的几张」轮换语义）
  const sessionRecent = useAppStore((s) => s.sessionRecent)
  const cycleCandidates = useMemo<SwitchCandidate[]>(
    () => sessionRecent.filter((p) => p !== mdPath).map(toCandidate),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上
    [sessionRecent, mdPath, workspaceDir],
  )

  /** Ctrl+Tab 步进（未开则呼出，reverse = Shift 反向从未项起）：mod 循环；无候选 no-op */
  const cycleStep = (reverse: boolean): void => {
    setCycle((cur) => {
      const n = cycleCandidates.length
      if (n === 0) return null
      if (cur === null) return reverse ? n - 1 : 0
      return (cur + (reverse ? -1 : 1) + n) % n
    })
  }

  /** 松 Ctrl 落定：切到高亮项（未开/越界 no-op），关浮层 */
  const commitCycle = (): void => {
    const idx = cycleRef.current
    if (idx === null) return
    setCycle(null)
    const target = cycleCandidates[idx]
    if (target !== undefined) void switchTo(target.mdPath)
  }

  // 轮换期间的全局键盘接管（窗口捕获阶段，先于 useEditorHotkeys 冒泡监听）：
  // 按住 Ctrl 连按 Tab 继续轮换（Shift 反向）、Enter 落定；松 Ctrl 落定（Windows/分级键序：
  // Tab 先松、Control 后松，确认时机 = Control 的 keyup）；窗口失焦兜底取消（Alt+Tab 切走丢 keyup）。
  // Esc 不在此处——radix Dialog 收口 onClose（= cancel）
  useEffect(() => {
    if (cycle === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        cycleStep(e.shiftKey)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        commitCycle()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') commitCycle()
    }
    const onBlur = () => setCycle(null)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅轮换开关沿重绑，内部走 refs 与 setCycle 函数式更新
  }, [cycle === null])

  return {
    switchOpen, // 搜索浮层
    open: () => setSwitchOpen(true),
    close: () => setSwitchOpen(false),
    candidates, // 搜索候选
    cycle, // 轮换高亮索引（null = 未开）
    cycleCandidates, // 轮换候选（会话 MRU）
    cycleStep, // Ctrl+Tab 步进/呼出（hotkeys 与轮换监听共用）
    setCycleActive: (i: number) => setCycle(i), // hover 同步（受控浮层）
    cancelCycle: () => setCycle(null),
    switchTo,
    leaveTo,
  }
}
