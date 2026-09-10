// src/services/codeHighlight.ts —— 代码块语法高亮内联化(2026-09 发布复制):
// vditor 预览的 hljs 是视口懒加载,离屏舞台从未触发,产物 code 是纯文本;此处自
// 加载 vendor hljs 高亮回填,再把 hljs 类名映射为内联色(公众号剥 class,色值
// 必须内联)。加载器经 HighlightDeps 注入(jsdom 单测替换)
import { VDITOR_CDN } from './vditorPreview'

/** hljs 形状(本管线只用两个方法) */
interface HljsLike {
  getLanguage(name: string): unknown
  highlight(code: string, opts: { language: string; ignoreIllegals: boolean }): { value: string }
}

/** 依赖注入口 */
export interface HighlightDeps {
  load(): Promise<HljsLike>
}

/** vendor hljs 脚本(script 注入,会话级缓存;vditor dist 自带同份文件) */
const HLJS_SRC = `${VDITOR_CDN}/dist/js/highlight.js/highlight.min.js`
let hljsPromise: Promise<HljsLike> | null = null

export function loadHljs(): Promise<HljsLike> {
  const w = window as unknown as { hljs?: HljsLike }
  if (w.hljs !== undefined) return Promise.resolve(w.hljs)
  if (hljsPromise !== null) return hljsPromise
  hljsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = HLJS_SRC
    s.onload = () => {
      const h = (window as unknown as { hljs?: HljsLike }).hljs
      if (h === undefined) {
        hljsPromise = null
        reject(new Error('hljs 脚本已载入但全局缺失'))
      } else {
        resolve(h)
      }
    }
    s.onerror = () => {
      hljsPromise = null // 允许后续重试
      reject(new Error(`hljs 脚本加载失败:${HLJS_SRC}`))
    }
    document.head.append(s)
  })
  return hljsPromise
}

/** hljs 类名 → 内联色(GitHub light 柔板,与主题浅灰底协调):关键字红、字符串
 *  深蓝、注释灰、数值/属性蓝、内建/标题紫、变量橙、标签绿 */
const HLJS_COLORS: Record<string, string> = {
  'hljs-keyword': '#cf222e',
  'hljs-selector-tag': '#cf222e',
  'hljs-doctag': '#cf222e',
  'hljs-string': '#0a3069',
  'hljs-regexp': '#0a3069',
  'hljs-comment': '#6e7781',
  'hljs-meta': '#6e7781',
  'hljs-number': '#0550ae',
  'hljs-literal': '#0550ae',
  'hljs-attr': '#0550ae',
  'hljs-attribute': '#0550ae',
  'hljs-symbol': '#0550ae',
  'hljs-built_in': '#8250df',
  'hljs-title': '#8250df',
  'hljs-class': '#8250df',
  'hljs-type': '#8250df',
  'hljs-variable': '#953800',
  'hljs-template-variable': '#953800',
  'hljs-tag': '#116329',
  'hljs-name': '#116329',
  'hljs-section': '#116329',
  'hljs-bullet': '#953800',
}

/** 类名映射内联色:遍历 token span 的 classList,首个命中表项刷 color */
function applyTokenColors(code: HTMLElement): void {
  for (const span of code.querySelectorAll<HTMLElement>('span[class]')) {
    for (const cls of span.classList) {
      const color = HLJS_COLORS[cls]
      if (color !== undefined) {
        span.style.color = color
        break
      }
    }
  }
}

/** 生产依赖:真脚本加载 */
const defaultDeps: HighlightDeps = { load: loadHljs }

/** 高亮编排:pre>code 按 language-* 类找语言,未注册(含降级残留的 zen-mermaid)
 *  跳过保持纯文本;单块失败 console.error 降级,不阻塞复制 */
export async function highlightCodeBlocks(root: ParentNode, deps: HighlightDeps = defaultDeps): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]'))
  if (blocks.length === 0) return // 快速路径:无代码块不加载脚本
  let hljs: HljsLike
  try {
    hljs = await deps.load()
  } catch (e) {
    console.error('hljs 脚本加载失败,代码块保持纯文本', e)
    return
  }
  for (const code of blocks) {
    // 语言取自 classList 的 language-* 项(真实元素 class 是 "language-ts hljs" 多类,
    // 不能整串正则);未注册语言(含降级残留的 zen-mermaid)跳过保持纯文本
    const lang = Array.from(code.classList).find((c) => c.startsWith('language-'))?.slice('language-'.length)
    if (lang === undefined || lang === '') continue
    if (hljs.getLanguage(lang) === null) continue
    try {
      // highlight 产物为对源码转义后的安全 HTML(token span 带 hljs-* 类名)
      code.innerHTML = hljs.highlight(code.textContent ?? '', { language: lang, ignoreIllegals: true }).value
      applyTokenColors(code)
    } catch (e) {
      console.error(`代码块高亮失败,保持纯文本(language-${lang ?? '?'})`, e)
    }
  }
}
