// src/hooks/useOpenDocument.ts —— 打开文档加载链（2026-09 自 EditorView 拆出，行数护栏）：
// 读 md → parse（失败走错误面板）→ sidecar（布局/弯曲记忆/折叠）→ 忽略块上报 →
// 插图元数据 → 引擎树落 state。纯编排：解析产物经回调上抛，EditorView 持全部 state；
// cancelled 守卫防切换文档（父组件 key 重挂载）后的迟到写入。
// 文档内容由父组件 key 重挂载切换——本 hook 仅挂载时执行一次（exhaustive-deps 豁免同旧内联 effect）。
import { useEffect } from 'react'
import { parse, zenToEngineTree } from '../services/mdTree'
import { buildImageMeta } from '../services/imageAssets'
import { readSidecar } from '../services/sidecar'
import { useAppStore } from '../store/appStore'
import type { LinkAdjust } from '../services/linkAdjust'
import type { IgnoredBlock } from '../types/tree'
import type { FsAdapter, LayoutKind } from '../types/files'
import type { EngineNode } from '../types/engine'

export interface OpenDocumentDeps {
  adapter: FsAdapter
  mdPath: string
  workspaceDir: string | null
  /** 挂载即清脏标记（EditorView 的 dirtyRef 归其持有，守卫「放弃」路径也读写） */
  onStart(): void
  /** parse 上报的未映射块（useIgnoredFlow.setFromParse） */
  onIgnored(blocks: IgnoredBlock[]): void
  /** sidecar 弯曲记忆（useLinkPurify.setLinkAdjust，须先于 onReady purify） */
  onLinkAdjust(adjust: LinkAdjust): void
  /** 初始布局落位（setInitialLayout/setLayout/layoutRef 三处同步的封装） */
  onLayout(initial: LayoutKind): void
  /** 引擎树就绪（EditorView 的 engineTree state） */
  onTree(tree: EngineNode): void
  /** 全链成功（loading → ready） */
  onReady(): void
  /** 解析失败（错误面板显示 parse 错误与原文） */
  onParseError(error: string, raw: string): void
  /** 读文件失败（如已被移动/删除） */
  onReadError(message: string): void
}

export function useOpenDocument(deps: OpenDocumentDeps): void {
  const { adapter, mdPath, workspaceDir } = deps
  useEffect(() => {
    deps.onStart()
    let cancelled = false
    void (async () => {
      try {
        const raw = await adapter.readTextFile(mdPath)
        const r = parse(raw)
        if (cancelled) return
        if (!r.ok) {
          deps.onParseError(r.error, raw)
          return
        }
        const sc = await readSidecar(adapter, mdPath)
        if (cancelled) return
        deps.onIgnored(r.ignoredBlocks)
        deps.onLinkAdjust(sc?.linkAdjust ?? {}) // M5d Task 5：弯曲记忆随净化入口恢复（须先于 onReady purify）
        // sidecar.layout 三处同步（挂载初值/激活态/保存引用，spec §3.7 打开恢复）；无 sidecar 回退用户偏好布局
        deps.onLayout(sc?.layout ?? useAppStore.getState().preferredLayout)
        // 插图元数据（M19）：src→dataURL+尺寸（失败宽容跳过），引擎 imgMap 渲染；
        // 编辑器路由必在工作区内（类型上防御空值）
        const imgMeta =
          workspaceDir !== null ? await buildImageMeta(adapter, workspaceDir, r.tree) : undefined
        if (cancelled) return
        deps.onTree(zenToEngineTree(r.tree, new Set(sc?.collapsed ?? []), '', imgMeta))
        deps.onReady()
      } catch (e) {
        // 读文件失败（如已被移动/删除）与解析失败走同一错误面板
        if (cancelled) return
        deps.onReadError(`无法读取文件（可能已被移动或删除）：${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时执行，文档内容由父组件 key 重挂载切换
  }, [])
}
