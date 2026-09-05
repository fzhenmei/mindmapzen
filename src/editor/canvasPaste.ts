// src/editor/canvasPaste.ts —— 画布态文本粘贴分派（2026-09 宿主接管 Control+v）
// 引擎原生 Render.paste() 第一步 navigator.clipboard.read() 会触发 WebView2「是否允许
// 访问剪贴板」权限弹窗（拒绝后连文本粘贴一并失效），MindMapCanvas 已移除引擎 Control+v
// 快捷键改由 paste 事件接管；文本语义在此复刻引擎分派（Render.js:1282-1324）：
// ① smm 格式（引擎 copy/cut 经 writeText 写入的 { simpleMindMap, data } JSON）→
//   INSERT_MULTI_CHILD_NODE 还原节点；② 普通文本 → INSERT_CHILD_NODE 整段单节点
// （本项目未配 handleIsSplitByWrapOnPasteCreateNewNode，引擎现状即不拆行；未用
// RichText 插件，无需转义）。只复刻「分派」层——插入语义（空选中/多选目标、入史、
// 重渲）由引擎命令本体保证，与接管前逐行为一致。
import { checkSmmFormatData } from 'simple-mind-map/src/utils/index.js'
import type { MindMapHandle } from '../types/engine'

/** 画布态粘贴文本分派：空文本 no-op（同引擎 paste 的 if (text) 守卫） */
export function pasteTextToCanvas(mm: MindMapHandle, text: string): void {
  if (text === '') return
  const { isSmm, data } = checkSmmFormatData(text)
  if (isSmm) {
    mm.execCommand('INSERT_MULTI_CHILD_NODE', [], Array.isArray(data) ? data : [data])
  } else {
    mm.execCommand('INSERT_CHILD_NODE', false, [], { text: data })
  }
}
