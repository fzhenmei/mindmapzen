// src/editor/noteTooltip.ts —— 画布正文悬停窗(2026-09-08 渲染统一):经引擎官方通道
// customNoteContentShow 接管(同前),渲染走 VDitor.preview(lute)——与弹窗/案头一条
// 管线,mermaid 围栏自动成图(vditor dist 资源)。原纯文本转义 + 手动拆段/300 字截断
// 退役:md 源码按字符截断会截破语法(表格半张/代码块未闭合),改限高滚动。
// 2026-09-22 边缘浮层修复:引擎 getNoteContentPosition 给的是备注图标原始视口坐标,
// 节点在右/下缘时放不下——fixed+left 的收缩适应盒可用宽=视口-left,右缘锚点会把盒
// 压窄(变形);右/下放不下时改贴锚点往左/上长(翻转),翻转后仍出界再钳视口兜底。
// show 按实测尺寸放置,异步渲染(mermaid/插图换 dataURL)完成尺寸变化后再放一次。
import { i18n } from '../i18n'
import { clampOverlayPos } from '../lib/utils'
import { renderVditorPreview } from '../services/vditorPreview'
import { applyImgSrcMap, buildImageMetaFromSrcs, collectRelativeImgSrcs } from '../services/imageAssets'
import { useAppStore } from '../store/appStore'

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
  // 原始锚点留存：重放(异步渲染完成)须从锚点算,不能在已放坐标上再放(右缘会越放越偏)
  let anchorLeft = 0
  let anchorTop = 0
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

  /** 锚点定侧放置:右/下缘放不下时贴锚点往左/上长(翻转),翻转后仍出界钳视口兜底;
   *  show 空盒/渲染后大盒各调一次 */
  const placeFromAnchor = (): void => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    const MARGIN = 8
    // 放不下 → 盒右/下缘贴回锚点往左/上长;界内 → 保持默认右/下展开
    const left = anchorLeft + w > vw - MARGIN ? anchorLeft - w : anchorLeft
    const top = anchorTop + h > vh - MARGIN ? anchorTop - h : anchorTop
    const c = clampOverlayPos(left, top, w, h, vw, vh, MARGIN)
    el.style.left = `${c.left}px`
    el.style.top = `${c.top}px`
  }

  const renderInto = async (note: string, seq: number): Promise<void> => {
    el.textContent = ''
    try {
      await renderVditorPreview(el, note, theme)
      if (seq !== showSeq) return
      // 正文插图（2026-09 相对路径）：webview 解析不了工作区相对 src——读盘换 dataURL
      //（同案头详情口径 getState 直取；无图/无工作区零开销跳过）
      const srcs = collectRelativeImgSrcs(el)
      if (srcs.size > 0) {
        const { adapter, workspaceDir } = useAppStore.getState()
        if (workspaceDir !== null) {
          const meta = await buildImageMetaFromSrcs(adapter, workspaceDir, srcs)
          if (seq !== showSeq) return // 读盘窗内切了目标：放弃本次换图
          applyImgSrcMap(el, new Map([...meta].map(([k, v]) => [k, v.dataUrl])))
        }
      }
      const more = document.createElement('div')
      more.className = 'zen-note-tip-more'
      more.style.cssText = 'margin-top:6px;color:var(--muted-foreground);font-size:11px;'
      more.textContent = i18n.t('editor.noteTooltip.more')
      el.appendChild(more)
      placeFromAnchor()
    } catch (e) {
      // 渲染失败降级:源码保底展示 + 显式出口(禁止吞异常)
      if (seq !== showSeq) return
      console.error('悬停窗正文渲染失败', e)
      const pre = document.createElement('pre')
      pre.style.cssText =
        'margin:0;padding:6px;font-family:var(--font-file);font-size:11px;white-space:pre-wrap;color:var(--destructive);'
      pre.textContent = note
      el.appendChild(pre)
      placeFromAnchor()
    }
  }

  return {
    show(note, left, top) {
      showSeq += 1
      el.dataset.note = note
      anchorLeft = left
      anchorTop = top
      // 先显形再放:display:none 时实测尺寸恒 0,右/下缘锚点会漏翻转
      el.style.display = 'block'
      placeFromAnchor()
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
