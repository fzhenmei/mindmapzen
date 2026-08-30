// src/editor/noteTooltip.ts —— 画布备注悬停窗（M17b：mermaid 备注即宿主延伸到画布）
// 经引擎官方通道 customNoteContentShow 接管（nodeCreateContents.js:446-478：设置后
// 引擎不建内置 noteEl，show(note, left, top)/hide() 全权交本实现），非 DOM hack。
// 样式令牌化（var(--card)/--foreground/--radius），双主题自动；文本段 textContent
// 转义、图源段走 renderMermaid（strict 转义 SVG）——无注入面。

import { renderMermaid, splitNoteSegments } from '../services/mermaidRender'

export interface NoteTooltip {
  /** 引擎 customNoteContentShow.show 契约：note 文本 + 视口坐标（fixed 定位） */
  show(note: string, left: number, top: number): void
  /** 引擎 customNoteContentShow.hide 契约 */
  hide(): void
  /** 双主题切换：重渲染当前内容（若在显示中） */
  setTheme(theme: 'light' | 'dark'): void
  /** 宿主卸载：移除 DOM */
  destroy(): void
}

/** 建画布备注悬停窗：常驻一个 fixed div（挂 body），show/hide 切换 display。
 *  渲染异步（mermaid 懒加载）——showSeq 序号守卫：快速 hover 多节点时旧结果不覆盖新内容；
 *  hide 后晚到的渲染写入被隐藏容器，无害 */
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
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--card);
    color: var(--foreground);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.6;
  `
  document.body.appendChild(el)

  /** 图源段宿主（muted 底圆角块，居中收宽） */
  const makeMermaidHost = (): HTMLElement => {
    const host = document.createElement('div')
    host.style.cssText =
      'display:flex;justify-content:center;margin-top:6px;overflow-x:auto;border-radius:4px;background:var(--muted);padding:4px;'
    host.dataset.testid = 'zen-note-tip-mermaid'
    return host
  }

  /** 图源段渲染进宿主：strict 转义 SVG 注入；语法错误降级源码保底（与详情态口径一致） */
  const renderMermaidInto = async (host: HTMLElement, code: string, seq: number): Promise<void> => {
    try {
      const svg = await renderMermaid(code, theme)
      if (seq !== showSeq) return // 期间已 show 别的内容
      host.innerHTML = svg // strict 转义 SVG（mermaidRender 注释），注入即渲染
      const svgEl = host.querySelector('svg')
      if (svgEl !== null) svgEl.style.maxWidth = '100%'
    } catch (e) {
      if (seq !== showSeq) return
      const pre = document.createElement('pre')
      pre.style.cssText =
        'margin:0;padding:6px;font-family:var(--font-file);font-size:11px;white-space:pre-wrap;color:var(--destructive);'
      pre.textContent = `${(e instanceof Error ? e.message : String(e)).split('\n')[0]}\n${code}`
      host.appendChild(pre)
    }
  }

  const renderInto = async (note: string, seq: number): Promise<void> => {
    el.textContent = ''
    for (const seg of splitNoteSegments(note)) {
      if (seg.kind === 'text') {
        const p = document.createElement('div')
        p.style.whiteSpace = 'pre-wrap'
        p.textContent = seg.content
        el.appendChild(p)
        continue
      }
      const host = makeMermaidHost()
      el.appendChild(host)
      await renderMermaidInto(host, seg.content, seq)
    }
  }

  return {
    show(note, left, top) {
      showSeq += 1
      el.dataset.note = note // setTheme 重渲染时取回
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.display = 'block'
      void renderInto(note, showSeq)
    },
    hide() {
      showSeq += 1 // 使在途渲染失效
      el.style.display = 'none'
      el.textContent = ''
    },
    setTheme(t) {
      if (t === theme) return
      theme = t
      // 显示中内容按新主题重渲染（display:block 且有内容时）
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
