// src/editor/noteTooltip.ts —— 画布正文悬停窗(2026-09-08 渲染统一):经引擎官方通道
// customNoteContentShow 接管(同前),渲染走 VDitor.preview(lute)——与弹窗/案头一条
// 管线,mermaid 围栏自动成图(vditor dist 资源)。原纯文本转义 + 手动拆段/300 字截断
// 退役:md 源码按字符截断会截破语法(表格半张/代码块未闭合),改限高滚动。
import { i18n } from '../i18n'
import { renderVditorPreview } from '../services/vditorPreview'

export interface NoteTooltip {
  show(note: string, left: number, top: number): void
  hide(): void
  setTheme(theme: 'light' | 'dark'): void
  destroy(): void
}

/** 建画布悬停窗:常驻 fixed div(挂 body),show/hide 切 display。渲染异步(vditor 首次
 *  加载 lute/mermaid)——showSeq 序号守卫:快速 hover 多节点旧结果不覆盖新内容 */
export function createNoteTooltip(initialTheme: 'light' | 'dark'): NoteTooltip {
  let theme = initialTheme
  let showSeq = 0
  const el = document.createElement('div')
  el.className = 'zen-note-tip'
  el.dataset.testid = 'zen-note-tip'
  el.style.cssText = `
    position: fixed;
    display: none;
    z-index: 1000;
    max-width: 60vw;
    max-height: 40vh;
    overflow-x: auto; /* = overflow:auto 的规范等价展开:jsdom 不展开 shorthand,overflowY 断言需 longhand */
    overflow-y: auto;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--card);
    color: var(--foreground);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    font-size: 13px;
    line-height: 1.6;
  `
  document.body.appendChild(el)

  const renderInto = async (note: string, seq: number): Promise<void> => {
    el.textContent = ''
    try {
      await renderVditorPreview(el, note, theme)
      if (seq !== showSeq) return
      const more = document.createElement('div')
      more.className = 'zen-note-tip-more'
      more.style.cssText = 'margin-top:6px;color:var(--muted-foreground);font-size:11px;'
      more.textContent = i18n.t('editor.noteTooltip.more')
      el.appendChild(more)
    } catch (e) {
      // 渲染失败降级:源码保底展示 + 显式出口(禁止吞异常)
      if (seq !== showSeq) return
      console.error('悬停窗正文渲染失败', e)
      const pre = document.createElement('pre')
      pre.style.cssText =
        'margin:0;padding:6px;font-family:var(--font-file);font-size:11px;white-space:pre-wrap;color:var(--destructive);'
      pre.textContent = note
      el.appendChild(pre)
    }
  }

  return {
    show(note, left, top) {
      showSeq += 1
      el.dataset.note = note
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.display = 'block'
      void renderInto(note, showSeq)
    },
    hide() {
      showSeq += 1
      el.style.display = 'none'
      el.textContent = ''
    },
    setTheme(t) {
      if (t === theme) return
      theme = t
      if (el.style.display !== 'none' && el.dataset.note !== undefined) {
        showSeq += 1
        void renderInto(el.dataset.note, showSeq)
      }
    },
    destroy() {
      showSeq += 1
      el.remove()
    },
  }
}
