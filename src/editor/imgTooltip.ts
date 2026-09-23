// src/editor/imgTooltip.ts —— 画布插图悬停大图浮层（M19 验收：像 Note 一样悬停查看）
// 订阅引擎 node_img_mouseenter/mouseleave（createImgNode 在图片 SVG 元素上发），
// 浮层 fixed 定位跟随鼠标、限 70vw/70vh 内显示原图（dataURL）。样式令牌化双主题自动。
// 2026-09-23 边缘截断修复：原按 480×320 估算翻转，真图尺寸外的情形无钳制——节点靠边
// 时浮层被视口截断。改锚点（鼠标坐标）翻转 + clampOverlayPos 钳视口兜底（与
// noteTooltip 同构），尺寸取图片 load 后实测；尺寸异步才知道 → 两段式显形（先
// visibility 藏起量测，定到最终位置后才显形，防先右后左闪现），showSeq 守卫防快速
// 切换/关闭后旧图迟到覆盖。
// 浮层可交互（2026-09-23，同 noteTooltip 方案）：引擎在图片元素 mouseleave 即调
// hide，浮层挂 body 不在其子树——鼠标移向浮层途中必触发。hide 改 HIDE_GRACE_MS
// 防抖，到点指针在浮层 rect 内则不藏（转入浮层 mouseleave 管理），Esc 无条件立即
// 关（输入元素上的 Esc 不拦），show 打断 pending 隐藏（切换图片不闪藏）。

import { clampOverlayPos } from '../lib/utils'
import { HIDE_GRACE_MS } from './noteTooltip'

export interface ImgTooltip {
  show(url: string, e: { clientX: number; clientY: number }): void
  hide(): void
  destroy(): void
}

/** 光标错位：浮层默认放指针右下 12px，防遮光标（翻转侧同样留 12px 间距） */
const CURSOR_GAP = 12

export function createImgTooltip(): ImgTooltip {
  const el = document.createElement('div')
  el.dataset.testid = 'zen-img-tip'
  el.style.cssText = `
    position: fixed;
    display: none;
    z-index: 1001;
    max-width: 70vw;
    max-height: 70vh;
    padding: 8px;
    border-radius: var(--radius);
    background: var(--card);
    color: var(--foreground);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  `
  const img = document.createElement('img')
  img.style.cssText = 'max-width:100%;max-height:70vh;border-radius:4px;display:block;'
  el.appendChild(img)
  document.body.appendChild(el)

  // 原始锚点留存：load 后放置须从锚点算，不能在已放坐标上再放（右缘会越放越偏）
  let anchorX = 0
  let anchorY = 0
  // 在途加载的 show 序号：hide/destroy/show 作废 showSeq 后，迟到的 load/error 跳过
  let showSeq = 0
  let loadSeq = 0
  // 指针守卫状态（浮层可交互）：hide 防抖句柄 + 最后指针坐标（显示期跟踪）
  let hideTimer: number | undefined
  let pointerX = 0
  let pointerY = 0
  let pointerSeen = false

  const trackMouse = (e: MouseEvent): void => {
    pointerX = e.clientX
    pointerY = e.clientY
    pointerSeen = true
  }

  /** 指针是否在浮层 rect 内（jsdom 无布局，量测桩见测试） */
  const isPointerInEl = (): boolean => {
    if (!pointerSeen) return false
    const r = el.getBoundingClientRect()
    return pointerX >= r.left && pointerX <= r.right && pointerY >= r.top && pointerY <= r.bottom
  }

  /** 真藏：作废在途加载 + 卸指针跟踪 + 隐藏清图。先作废 seq 再清 src——清空地址
   *  会异步触发一次空 error，守卫拦下不误报加载失败 */
  const hideNow = (): void => {
    showSeq += 1
    window.clearTimeout(hideTimer)
    hideTimer = undefined
    document.removeEventListener('mousemove', trackMouse)
    el.style.display = 'none'
    el.style.visibility = 'hidden'
    img.src = ''
  }

  /** 防抖隐藏：到点指针在浮层上则不藏（用户在看图，等浮层 mouseleave 再议） */
  const scheduleHide = (): void => {
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined
      if (el.style.display === 'none') return
      if (isPointerInEl()) return
      hideNow()
    }, HIDE_GRACE_MS)
  }

  // 指针离场浮层：防抖关（期间重回浮层/图片 mouseenter→show 都会打断）
  el.addEventListener('mouseleave', () => {
    if (el.style.display !== 'none') scheduleHide()
  })

  // Esc 立即关（无防抖）：目标为输入元素时不拦截——留给节点编辑框自己的 Esc 语义
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || el.style.display === 'none') return
    const t = e.target as HTMLElement | null
    if (t !== null && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return
    hideNow()
  }
  document.addEventListener('keydown', onKeyDown)

  /** 锚点定侧放置：右/下缘放不下时贴指针往左/上长（翻转），翻转后仍出界钳视口兜底；
   *  量实测尺寸（display 已切 block、visibility 藏起不碍布局），load 完成后调 */
  const place = (): void => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left =
      anchorX + CURSOR_GAP + w > vw - 8 ? anchorX - CURSOR_GAP - w : anchorX + CURSOR_GAP
    const top =
      anchorY + CURSOR_GAP + h > vh - 8 ? anchorY - CURSOR_GAP - h : anchorY + CURSOR_GAP
    const c = clampOverlayPos(left, top, w, h, vw, vh, 8)
    el.style.left = `${c.left}px`
    el.style.top = `${c.top}px`
  }

  // 图片加载完成/失败（dataURL 亦异步）：守卫通过才放置显形；失败走显式出口不吞
  const onImgLoad = (): void => {
    if (loadSeq !== showSeq) return
    place()
    el.style.visibility = 'visible' // 定到最终位置后才显形（防首帧跳变）
  }
  const onImgError = (): void => {
    if (loadSeq !== showSeq) return
    console.error('插图浮层图片加载失败', img.src)
    hideNow()
  }
  img.addEventListener('load', onImgLoad)
  img.addEventListener('error', onImgError)

  return {
    show(url, e) {
      showSeq += 1
      loadSeq = showSeq
      window.clearTimeout(hideTimer) // 打断 pending 隐藏：hover 切换图片不闪藏
      hideTimer = undefined
      anchorX = e.clientX
      anchorY = e.clientY
      img.src = url
      // 先显形（display）再藏起（visibility）：display:none 时实测尺寸恒 0 会漏翻转；
      // 藏起参与布局不碍量测，load 完成按真实尺寸放置后才显形（两段式，见文件头）
      el.style.display = 'block'
      el.style.visibility = 'hidden'
      document.addEventListener('mousemove', trackMouse) // 同引用重复 add 幂等
    },
    hide() {
      // 防抖：引擎在图片元素 mouseleave 即调 hide，浮层挂 body 不在其子树——鼠标移向
      // 浮层途中必触发，立即藏则指针永远进不了浮层（没法把鼠标放上去看图）
      scheduleHide()
    },
    destroy() {
      showSeq += 1
      window.clearTimeout(hideTimer)
      hideTimer = undefined
      document.removeEventListener('mousemove', trackMouse)
      document.removeEventListener('keydown', onKeyDown)
      el.remove()
    },
  }
}

/** 引擎 imgMap 查询（renderTree.data.imgMap：src→dataURL；无表/未命中返回 null） */
export function engineImgMapGet(
  mm: unknown,
  src: string,
): string | null {
  const tree = (mm as { renderer?: { renderTree?: { data?: { imgMap?: Record<string, string> } } } })
    .renderer?.renderTree?.data
  return tree?.imgMap?.[src] ?? null
}
