// src/services/slimScrollbarHover.ts —— 细滚动条悬停显隐（2026-09 细滚动条）：
// Chromium 合成器以静态解析的样式绘制 ::-webkit-scrollbar，:hover 等动态伪类变化
// 不触发滚动条重绘（Chromium 152 实测：hover 条件色恒不生效，class 变更立即重绘），
// 故「指针进入滚动区才显示滑块」以 class 切换实现：pointerover 给指针的全部可滚
// 祖先挂 .sb-hot（App.css 据此给 thumb 着色），指针移出这些容器或离窗时摘除。
// document 级委托一次装配，业务滚动容器（树/网格/大纲/列表）零改动自动生效；
// 对话框内 Radix ScrollArea 为组件级自绘（type="hover"），不经引擎滚动条，与本守卫无关。
/** 幂等守卫：重复调用不叠加监听（挂载期调一次即可） */
let installed = false

/** 悬停态 class：App.css `.sb-hot::-webkit-scrollbar-thumb` 消费 */
const HOT = 'sb-hot'

/** 可滚判定：任一轴 overflow 为 auto/scroll。不查 scrollHeight——jsdom 无布局亦可测，
 *  且 auto 容器未溢出时引擎本就不画滚动条，多挂 class 无害 */
const scrollable = (el: Element): boolean => {
  const s = getComputedStyle(el)
  return /(auto|scroll)/.test(`${s.overflowY} ${s.overflowX}`)
}

/** 给指针所在链上的可滚容器切换悬停态，顺手清理已卸载元素（对话框关闭等） */
const settle =
  (hot: Element[]) =>
  (next: Element[]): void => {
    for (const el of hot) if (!next.includes(el)) el.classList.remove(HOT)
    for (const el of next) el.classList.add(HOT)
    hot = next.filter((el) => el.isConnected)
  }

export function enableSlimScrollbarHover(target: Window = window): void {
  if (installed) return
  installed = true

  const apply = settle([])
  target.document.addEventListener('pointerover', (e) => {
    const chain: Element[] = []
    for (let el = e.target; el instanceof Element; el = el.parentElement) {
      if (scrollable(el)) chain.push(el)
    }
    apply(chain)
  })
  // 离窗兜底：指针移出窗口（pointerout 无 relatedTarget）清全部悬停态
  target.document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget === null) apply([])
  })
}
