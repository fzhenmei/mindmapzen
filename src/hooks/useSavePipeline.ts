// src/hooks/useSavePipeline.ts —— 保存管线（M5a 拆分自 EditorView，零行为变化）：
// 串行保存链、5s 防抖自动保存、布局 sidecar 即时落盘。依赖经 opts 注入（脏标记 ref 归 EditorView 持有，
// 守卫「放弃」路径也读写它）；所有管线状态走 refs，闭包取首渲染值即可（同 dirtyRef 模式）。
import { useRef, type RefObject } from 'react'
import { engineTreeToZen, serialize } from '../services/mdTree'
import { writeSidecar } from '../services/sidecar'
import { collectLinkAdjust, type LinkAdjust } from '../services/linkAdjust'
import { harvestRegistry } from '../editor/linkRegistry'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { FsAdapter, LayoutKind, Sidecar } from '../types/files'
import type { EngineNode, MindMapHandle } from '../types/engine'

const AUTOSAVE_MS = 5000

export interface SavePipelineOpts {
  adapter: FsAdapter
  mdPath: string
  mmRef: RefObject<MindMapHandle | null>
  layoutRef: RefObject<LayoutKind>
  dirtyRef: RefObject<boolean>
  /** 连线净化会话注册表（M5d Task 2）：序列化时按 uid 查表句尾注入 [[..]] 标记（稳定引用对象） */
  registry: LinkRegistry
  onDirtyChange: (dirty: boolean) => void // 脏标记同步（markDirty / clearDirty）
  onError: (msg: string) => void // 保存失败横幅（setError）
  onSaved?: () => void // md+sidecar 落盘成功后回调（M5b Task 3：双链重建随保存链）
  /** 外部变更裁决（多实例/外部编辑器改盘）：保存链挂起等待三态决策——
   *  overwrite 以内存为准续写；reload/cancel 中止本轮保脏（重载导航由上层按决策执行） */
  onExternalConflict(): Promise<'overwrite' | 'reload' | 'cancel'>
}

export interface SavePipeline {
  /** 串行保存链（在途合并/rev 门闩/同值去重），含 sidecar */
  saveNow(): Promise<boolean>
  /** 布局即时落盘（仅 sidecar） */
  persistLayoutSidecar(): Promise<void>
  /** 脏标记+防抖自动保存+快照去重+pending 标记（原 EditorView.onDataChange） */
  onTreeDataChange(data?: EngineNode): void
  /** 冲突基线初始化（打开文档上报磁盘原文；此后随每次成功落盘刷新） */
  initBaseline(raw: string): void
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
  // 冲突基线（外部变更检测）：打开时的磁盘原文 / 最近一次本会话成功落盘的内容。
  //  写盘前重读对比——不一致即磁盘被另一实例或外部编辑器改过，盲写会静默覆盖对方
  const baselineRef = useRef<string | null>(null)

  /** 完整 Sidecar 构造（writeOnce 与布局切换即时落盘共用同一形状；layout 取当前切换值）。
   *  linkAdjust（M5d Task 5）由调用方从引擎树采集——布局即时落盘也须带上，否则切换布局会抹掉已拖弯曲 */
  const buildSidecar = (collapsed: string[], linkAdjust: LinkAdjust): Sidecar => ({
    version: 1,
    theme: 'default',
    layout: layoutRef.current,
    collapsed,
    offsets: {},
    canvas: { x: 0, y: 0, zoom: 1 },
    linkAdjust,
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
      // v0.7.0 验收修复（删线复活）：序列化前以引擎现态重建注册表（引擎 targets ∪ 残留文本
      // 标记，**替换**而非并集）——删线（引擎 removeLine 修剪 targets → data_change 置脏）后的
      // 保存不再把陈旧条目注回 md；md 是事实源，无标记则重开重建无线（删了不再回来）
      harvestRegistry(snapshot, opts.registry)
      const { tree, collapsed } = engineTreeToZen(snapshot)
      // M5d Task 2 序列化注入：净化会话下引擎文本无标记，连线按注册表（uid）句尾注入回 md
      const mdContent = serialize(tree, opts.registry.byUid)
      // 外部变更检测：磁盘现内容 ≠ 基线（打开原文 / 上次落盘内容）即已被另一实例或外部
      // 编辑器改写——无条件覆盖会静默吞掉对方变更（多开互覆实案），挂起保存链交上层裁决。
      //  读盘失败（文件被移除/删除）不视为冲突：写回即恢复
      let disk: string | null = null
      try {
        disk = await adapter.readTextFile(mdPath)
      } catch {
        // 文件不在了：落盘即重建，无需裁决
      }
      if (disk !== null && baselineRef.current !== null && disk !== baselineRef.current) {
        const choice = await opts.onExternalConflict()
        if (choice !== 'overwrite') return false // reload/cancel：中止本轮保脏，不写盘
      }
      await adapter.writeTextFileAtomic(mdPath, mdContent)
      // 基线随 md 落盘即刻刷新（先于 sidecar）：sidecar 失败保脏重试时不得把自己的
      // md 写入误判为外部变更再弹一次裁决
      baselineRef.current = mdContent
      // M5d Task 5 弯曲采集：引擎 offsets（uid 失联/空洞自然跳过）→ sidecar linkAdjust（路径对键）
      await writeSidecar(adapter, mdPath, buildSidecar(collapsed, collectLinkAdjust(snapshot)))
      opts.onSaved?.()
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

  /** sidecar-only 即时落盘（审查裁定）：collapsed 取引擎当前树，构造与 writeOnce 相同
   *  （linkAdjust 同步采集，防切换布局抹掉弯曲记忆）；仅写 sidecar，不写 .md、不动脏标记；
   *  失败提示横幅（fire-and-forget，不重试不阻塞） */
  const persistLayoutSidecar = async (): Promise<void> => {
    const mm = mmRef.current
    if (!mm) return
    try {
      const snapshot = mm.getData()
      const { collapsed } = engineTreeToZen(snapshot)
      await writeSidecar(adapter, mdPath, buildSidecar(collapsed, collectLinkAdjust(snapshot)))
    } catch (e) {
      onError('保存布局失败：' + String(e))
    }
  }

  /** 冲突基线初始化：打开文档时上报磁盘原文（useOpenDocument 的 onRaw → 此处） */
  const initBaseline = (raw: string): void => {
    baselineRef.current = raw
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

  return { saveNow, persistLayoutSidecar, onTreeDataChange, initBaseline, clearPendingAutosave, unmountFlush }
}
