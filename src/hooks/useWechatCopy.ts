// src/hooks/useWechatCopy.ts —— 复制为公众号格式（2026-09 砚栏复制组旁，三态恒显）：
// 点击时从内存树现场序列化 display 形态 md（与 MarkdownView 显示同口径同输入——
// 所见即所复制，含未保存修改；与视图态无关）→ copyWechatHtmlFromMd 全链 → 富文本剪贴板端口。
// 抽 hook 而非内联 EditorView：其行数贴护栏（863/870），且逻辑自成单元可独立测试。
// 失败走轻提示 + console 双出口（编辑器路由无 error 横幅渲染，toast 是编辑器侧
// 显式出口惯例——篮子分拣同款，详见 memory/editor-route-error-outlet）。
import { useCallback, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, serialize } from '../services/mdTree'
import { copyWechatHtmlFromMd } from '../services/wechatCopy'
import { showToast } from '../services/toast'
import type { WriteHtmlClipboard } from '../services/clipboard'
import type { MindMapHandle } from '../types/engine'
import type { LinkRegistry } from '../editor/linkRegistry'

export interface WechatCopyApi {
  /** 全链在途（防连点：砚栏钮 disabled 信号） */
  busy: boolean
  /** 入口：现场序列化 → 公众号全链 → 端口；任何失败 toast + console，成功 toast */
  run(): void
}

/** 序列化可能抛错（Word 粘贴毒节点家族：换行/列表层正文断言）——同步失败单独
 *  出口（不进 promise 链），提示文案与异步失败同键 */
export function useWechatCopy(
  mmRef: RefObject<MindMapHandle | null>,
  registry: LinkRegistry,
  writeHtmlClipboard: WriteHtmlClipboard,
): WechatCopyApi {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const run = useCallback(() => {
    if (busy) return
    const mm = mmRef.current
    if (mm === null) return
    let md: string
    try {
      md = serialize(engineTreeToZen(mm.getData()).tree, registry.byUid, { display: true })
    } catch (e) {
      console.error('复制为公众号格式失败：序列化', e)
      showToast(t('editor.markdown.copyWechatFailed', { reason: e instanceof Error ? e.message : String(e) }))
      return
    }
    setBusy(true)
    const { adapter, workspaceDir } = useAppStore.getState()
    void copyWechatHtmlFromMd(adapter, workspaceDir, md, writeHtmlClipboard)
      .then(() => showToast(t('editor.markdown.copiedToast')))
      .catch((e) => {
        console.error('复制为公众号格式失败', e)
        showToast(t('editor.markdown.copyWechatFailed', { reason: e instanceof Error ? e.message : String(e) }))
      })
      .finally(() => setBusy(false))
  }, [busy, mmRef, registry, writeHtmlClipboard, t])

  return { busy, run }
}
