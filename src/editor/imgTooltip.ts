// src/editor/imgTooltip.ts —— 画布插图悬停大图浮层（M19 验收：像 Note 一样悬停查看）
// 订阅引擎 node_img_mouseenter/mouseleave（createImgNode 在图片 SVG 元素上发），
// 浮层 fixed 定位跟随鼠标、限 70vw/70vh 内显示原图（dataURL）。样式令牌化双主题自动。

export interface ImgTooltip {
  show(url: string, e: { clientX: number; clientY: number }): void
  hide(): void
  destroy(): void
}

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

  return {
    show(url, e) {
      img.src = url
      // 鼠标右下错位 12px，防遮光标；越屏右边/下边时翻到左/上侧
      const w = 480
      const x = e.clientX + 12 + w > window.innerWidth ? Math.max(8, e.clientX - w - 12) : e.clientX + 12
      const y = e.clientY + 12 + 320 > window.innerHeight ? Math.max(8, e.clientY - 332) : e.clientY + 12
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.display = 'block'
    },
    hide() {
      el.style.display = 'none'
      img.src = ''
    },
    destroy() {
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
