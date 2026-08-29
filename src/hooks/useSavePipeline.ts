// src/hooks/useSavePipeline.ts —— 保存管线（M5a 拆分自 EditorView，零行为变化）：
// 串行保存链、5s 防抖自动保存、布局 sidecar 即时落盘。依赖经 opts 注入（脏标记 ref 归 EditorView 持有，
// 守卫「放弃」路径也读写它）；所有管线状态走 refs，闭包取首渲染值即可（同 dirtyRef 模式）。
import { useRef, type MutableRefObject, type RefObject } from 'react'
import { engineTreeToZen, serialize } from '../services/mdTree'
import { writeSidecar } from '../services/sidecar'
import type { FsAdapter, LayoutKind, Sidecar } from '../types/files'
import type { EngineNode, MindMapHandle } from '../types/engine'

const AUTOSAVE_MS = 5000

export interface SavePipelineOpts {
  adapter: FsAdapter
  mdPath: string
  mmRef: RefObject<MindMapHandle | null>
  layoutRef: MutableRefObject<LayoutKind>
  dirtyRef: MutableRefObject<boolean>
  onDirtyChange: (dirty: boolean) => void // 脏标记同步（markDirty / clearDirty）
  onError: (msg: string) => void // 保存失败横幅（setError）
}

export interface SavePipeline {
  /** 串行保存链（在途合并/rev 门闩/同值去重），含 sidecar */
  saveNow(): Promise<boolean>
  /** 布局即时落盘（仅 sidecar） */
  persistLayoutSidecar(): Promise<void>
  /** 脏标记+防抖自动保存+快照去重+pending 标记（原 EditorView.onDataChange） */
  onTreeDataChange(data?: EngineNode): void
  /** 清防抖自动保存定时器 */
  clearPendingAutosave(): void
  /** 卸载冲刷（含返回文件库） */
  unmountFlush(): void
}

export function useSavePipeline(opts: SavePipelineOpts): SavePipeline {
  const { adapter, mdPath, mmRef, layoutRef, dirtyRef, onDirtyChange, onError } = opts
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true)) // 当前串行保存轮（在途合并调用方等待它的最终结局）
  const dataRevRef = useRef(0) // 数据修订号：写盘窗口内落新编辑时递增，writeOnce 据此拒绝盲目清脏
  const lastSavedDataRef = useRef<string | null>(null) // 最近一次成功落盘的引擎整树快照（JSON），供 data_change 同值去重

  /** 完整 Sidecar 构造（writeOnce 与布局切换即时落盘共用同一形状；layout 取当前切换值） */
  const buildSidecar = (collapsed: string[]): Sidecar => ({
    version: 1,
    theme: 'default',
    layout: layoutRef.current,
    collapsed,
    offsets: {},
    canvas: { x: 0, y: 0, zoom: 1 },
  })

  /** 单轮保存：md + sidecar 原子落盘，返回成功与否（无实例/不脏视为成功）。
   *  清脏以修订号为门闩：快照前记 dataRevRef，写盘窗口内若落新编辑（修订号变）则本轮快照
   *  不含该编辑——此时不能清脏（否则该编辑不在任何快照里且无人再补存，静默丢失），保脏并置补存。 */
  const writeOnce = async (): Promise<boolean> => {
    const mm = mmRef.current
    if (!mm || !dirtyRef.current) return true
    try {
      const rev = dataRevRef.current
      const snapshot = mm.getData()
      const { tree, collapsed } = engineTreeToZen(snapshot)
      await adapter.writeTextFileAtomic(mdPath, serialize(tree))
      await writeSidecar(adapter, mdPath, buildSidecar(collapsed))
      // 记录落盘快照：引擎节流补发的同值 data_change 到达时据此免置脏（见 onTreeDataChange）
      lastSavedDataRef.current = JSON.stringify(snapshot)
      if (dataRevRef.current !== rev) {
        // 写盘窗口内有新编辑：保脏，置补存让串行循环用新快照再来一轮
        pendingRef.current = true
        return true
      }
      dirtyRef.current = false
      onDirtyChange(false)
      return true
    } catch (e) {
      // 保存失败：保留脏标记（数据未落盘不能丢），提示后等待重试
      dirtyRef.current = true
      onDirtyChange(true)
      onError('保存失败：' + String(e))
      return false
    }
  }

  /** 串行化保存：在途时新请求只标记补存，并等待当前轮的最终结局（其循环会消化补存标记）。
   *  合并分支必须返回当前轮 promise 而非立即 true——否则守卫保存/返回文件库会在补存轮
   *  真正落盘前退出（窗口销毁/引擎销毁，补存轮可能永不执行）。 */
  const saveNow = async (): Promise<boolean> => {
    if (savingRef.current) {
      pendingRef.current = true
      return saveChainRef.current
    }
    const run = (async () => {
      savingRef.current = true
      try {
        while (true) {
          pendingRef.current = false
          if (!(await writeOnce())) return false
          if (!pendingRef.current) return true
        }
      } finally {
        savingRef.current = false
      }
    })()
    saveChainRef.current = run
    return run
  }

  /** 引擎数据变化（data_change 携带整树快照；无载荷调用来自展开命令同步上报，视为必有变化）。
   *  同值去重（验收修复 4）：引擎 data_change 经 addHistory 尾随节流延迟 ~100ms 补发，快照可能
   *  在此间已被显式保存落盘——与 lastSavedDataRef 一致的事件不置脏，否则保存成功的图会在
   *  ~100ms 后重新亮起未保存圆点并触发一轮冗余自动保存 */
  const onTreeDataChange = (data?: EngineNode): void => {
    if (
      data !== undefined &&
      lastSavedDataRef.current !== null &&
      JSON.stringify(data) === lastSavedDataRef.current
    ) {
      return
    }
    dirtyRef.current = true
    dataRevRef.current++
    // 写盘在途时的新编辑不在在途快照内：标记补存，让当前轮写完再补一轮（否则无人再触发落盘）
    if (savingRef.current) pendingRef.current = true
    onDirtyChange(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveNow(), AUTOSAVE_MS)
  }

  /** sidecar-only 即时落盘（审查裁定）：collapsed 取引擎当前树，构造与 writeOnce 相同；
   *  仅写 sidecar，不写 .md、不动脏标记；失败提示横幅（fire-and-forget，不重试不阻塞） */
  const persistLayoutSidecar = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    try {
      const { collapsed } = engineTreeToZen(mm.getData())
      await writeSidecar(adapter, mdPath, buildSidecar(collapsed))
    } catch (e) {
      onError('保存布局失败：' + String(e))
    }
  }

  /** 清防抖自动保存定时器（原 EditorView 内联的 `if (timerRef) clearTimeout` 两处调用点） */
  const clearPendingAutosave = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  /** unmount 冲刷（含返回文件库）：清定时器，尚脏则补一轮落盘 */
  const unmountFlush = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (dirtyRef.current) void saveNow() // unmount 冲刷（含返回文件库）
  }

  return { saveNow, persistLayoutSidecar, onTreeDataChange, clearPendingAutosave, unmountFlush }
}
