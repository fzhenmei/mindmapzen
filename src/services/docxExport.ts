// src/services/docxExport.ts —— 渲染 DOM → 真 .docx(2026-09-23 导出 Word/PDF spec §3):
// 遍历 publishBody 产物映射 docx 元素,样式值与公众号主题同源(wechatCopy TAG_STYLE
// 同值换算,px→pt 按 1px=0.75pt、half-point 取整——纸面观感按视觉验收统一微调)。
// 引用块(仅用户手写真引用——防炸包装层已在 publishBody 解包)= 段落左边框 3pt
// D0D0D0 + 底纹 F7F7F7 + 左缩进;代码高亮逐 run 颜色保留;图片/mermaid PNG 以
// dataURL 嵌入;链接保留可点击(导出无公众号剥链约束)。纯函数,jsdom 可测
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
  type ParagraphChild,
} from 'docx'
import { dataUrlToBytes } from './exportImage'

/** docx 段落/表格子元素(块级产物累积容器) */
type DocxChildren = (Paragraph | Table)[]

/** OL 编号实例序列:OOXML 中共用 numId 的段落编号跨段连续,不分实例时第二个
 *  <ol> 会从 4,5,6… 接编。buildDocxFromBody 持本计数器,每个顶层 OL 树领一个
 *  新 instance(docx 库按 reference-instance 建 concrete numbering → 独立 numId) */
interface OlSeq {
  next: number
}

const FONT_MONO = 'Consolas'
// 字号(half-point):标题 15/13.5→27 取整 27/12/11pt,正文 11pt,代码 10pt。
// 22.5 无法入整数 half-point,就近取整——观感差异不可辨,spec 已裁定按视觉可微调
const H_SIZE: Record<number, number> = { 1: 30, 2: 27, 3: 24, 4: 22, 5: 22, 6: 22 }
const BODY_SIZE = 22
const CODE_SIZE = 20
const HEADING_COLOR = '1F1F1F'
const QUOTE_TEXT_COLOR = '5F5F5F'
const LINK_COLOR = '576B95'
/** 图片页宽钳制:A4 可用宽 16cm ≈ 605px@96dpi,取 600;naturalWidth 为 0(jsdom)兜底 600×400 */
const IMG_MAX_W = 600
const LINE_BODY = { line: 420, lineRule: 'auto' as const } // 1.75×240

/** 行内样式累积器:沿 DOM 下行继承加粗/斜体/等宽/颜色/底纹/字号 */
interface RunStyle {
  bold?: boolean
  italics?: boolean
  mono?: boolean
  color?: string
  shading?: string
  size?: number
}

/** css 颜色串 → docx 六位大写 hex(#rrggbb 或 rgb(r,g,b);其余形态放弃返 undefined) */
function cssColorToHex(css: string): string | undefined {
  const s = css.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(s)
  if (hex) return hex[1]!.toUpperCase()
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(s)
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] as const
    return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  return undefined
}

/** RunStyle → TextRun 属性(缺省字号:mono 用代码号,否则正文号) */
function runOf(text: string, st: RunStyle, brk?: 1): TextRun {
  return new TextRun({
    text,
    break: brk,
    bold: st.bold,
    italics: st.italics,
    color: st.color,
    font: st.mono ? FONT_MONO : undefined,
    size: st.size ?? (st.mono ? CODE_SIZE : BODY_SIZE),
    shading: st.shading === undefined ? undefined : { type: ShadingType.CLEAR, fill: st.shading },
  })
}

/** 行内子树 → run 列表(追加进 out)。文本节点拆 \n 为 run break(pre 换行的统一通道) */
function inlineRuns(node: Node, st: RunStyle, out: ParagraphChild[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const lines = (node.textContent ?? '').split('\n')
    lines.forEach((seg, i) => {
      if (i === 0) {
        if (seg !== '') out.push(runOf(seg, st))
      } else out.push(runOf(seg, st, 1)) // 后续行:break 前置在行首 run
    })
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      for (const c of el.childNodes) inlineRuns(c, { ...st, bold: true }, out)
      return
    case 'EM':
    case 'I':
      for (const c of el.childNodes) inlineRuns(c, { ...st, italics: true }, out)
      return
    case 'CODE':
      for (const c of el.childNodes) inlineRuns(c, { ...st, mono: true, shading: 'F5F5F5' }, out)
      return
    case 'A': {
      const inner: ParagraphChild[] = []
      for (const c of el.childNodes) inlineRuns(c, { ...st, color: LINK_COLOR }, inner)
      if (inner.length > 0) out.push(new ExternalHyperlink({ link: el.getAttribute('href') ?? '', children: inner }))
      return
    }
    case 'BR':
      out.push(runOf('', st, 1))
      return
    case 'SPAN': {
      // hljs 高亮 span:内联 color 进 run(色串不识别则原样透传子树)
      const color = cssColorToHex(el.style.color)
      for (const c of el.childNodes) inlineRuns(c, color === undefined ? st : { ...st, color }, out)
      return
    }
    case 'IMG': {
      const img = imageRunOf(el as HTMLImageElement)
      if (img !== null) out.push(img)
      else console.warn('docxExport:图片 src 非 data URL,已跳过', el.getAttribute('src'))
      return
    }
    default:
      for (const c of el.childNodes) inlineRuns(c, st, out)
  }
}

/** img → ImageRun(dataURL → 字节嵌入;原始像素→px,页宽 600px 钳制;jsdom 无尺寸兜底) */
function imageRunOf(img: HTMLImageElement): ImageRun | null {
  const src = img.getAttribute('src') ?? ''
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,/.exec(src)
  if (m === null) return null
  const type = (m[1] === 'jpeg' ? 'jpg' : m[1]) as 'png' | 'jpg' | 'gif' | 'bmp'
  let w = img.naturalWidth || IMG_MAX_W
  let h = img.naturalHeight || 400
  if (w > IMG_MAX_W) {
    h = Math.round((h * IMG_MAX_W) / w)
    w = IMG_MAX_W
  }
  return new ImageRun({ type, data: dataUrlToBytes(src), transformation: { width: w, height: h } })
}

/** 容器的块级元素子节点(过滤空白文本节点) */
function blockChildren(el: Element): Element[] {
  return [...el.children]
}

/** 引用块段落公共属性(嵌套引用缩进递增) */
function quoteParagraph(runs: ParagraphChild[], level: number): Paragraph {
  return new Paragraph({
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: 'D0D0D0', space: 4 } }, // 3pt
    shading: { type: ShadingType.CLEAR, fill: 'F7F7F7' },
    indent: { left: 360 * (level + 1) },
    spacing: { before: 160, after: 160, ...LINE_BODY },
    children: runs,
  })
}

/** 引用块:块级子元素分派——p/裸文本 → 引用段;嵌套 blockquote → 递归;列表/代码/
 *  表格等保持自身样式(引用内出现频次低,不为它们叠加引用铬框,v1 取舍) */
function mapQuote(bq: Element, level: number, out: DocxChildren, olSeq: OlSeq): void {
  const blocks = blockChildren(bq)
  if (blocks.length === 0) {
    const runs: ParagraphChild[] = []
    for (const c of bq.childNodes) inlineRuns(c, { color: QUOTE_TEXT_COLOR }, runs)
    out.push(quoteParagraph(runs.length > 0 ? runs : [runOf('', {})], level))
    return
  }
  for (const child of blocks) {
    if (child.tagName === 'BLOCKQUOTE') {
      mapQuote(child, level + 1, out, olSeq)
      continue
    }
    if (child.tagName === 'UL' || child.tagName === 'OL' || child.tagName === 'PRE' || child.tagName === 'TABLE') {
      mapBlock(child, level, out, olSeq) // 块级元素自身样式,不带引用铬
      continue
    }
    const runs: ParagraphChild[] = []
    for (const c of child.childNodes) inlineRuns(c, { color: QUOTE_TEXT_COLOR }, runs)
    out.push(quoteParagraph(runs, level))
  }
}

/** 代码块:pre(取内层 code 的行内子树)→ 单段 F6F8FA 底纹,换行走 run break */
function mapPre(pre: Element, out: DocxChildren): void {
  const code = pre.querySelector('code')
  const runs: ParagraphChild[] = []
  for (const n of (code ?? pre).childNodes) inlineRuns(n, { mono: true }, runs)
  out.push(
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: 'F6F8FA' },
      spacing: { before: 160, after: 160, line: 384, lineRule: 'auto' }, // 1.6×240
      children: runs.length > 0 ? runs : [runOf('', { mono: true })],
    }),
  )
}

/** 列表:UL/OL → zen-ul/zen-ol 编号引用;li 内嵌套列表先记后发(层级 +1)。
 *  instance = 所属顶层列表树领的编号实例:兄弟 <ol> 各领一个(编号各自从 1 起,
 *  不分实例则第二个 <ol> 从 4,5,6… 接编);嵌套子列表沿用(同 numId 内层级切换
 *  本身触发 OOXML 逐级重启,无需再分)。UL 圆点无编号连续问题,不应用实例 */
function mapList(list: Element, depth: number, instance: number, out: DocxChildren): void {
  const reference = list.tagName === 'OL' ? 'zen-ol' : 'zen-ul'
  const level = Math.min(depth, 3) // numbering 配置 4 级,更深贴第 4 级
  const numbering = list.tagName === 'OL' ? { reference, level, instance } : { reference, level }
  for (const li of [...list.children].filter((e) => e.tagName === 'LI')) {
    const runs: ParagraphChild[] = []
    const nested: Element[] = []
    for (const child of li.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element
        if (el.tagName === 'UL' || el.tagName === 'OL') {
          nested.push(el)
          continue
        }
        if (el.tagName === 'P') {
          for (const c of el.childNodes) inlineRuns(c, {}, runs) // 松散列表:内联并入本项
          continue
        }
      }
      inlineRuns(child, {}, runs)
    }
    out.push(
      new Paragraph({
        numbering,
        spacing: { before: 60, after: 60, ...LINE_BODY },
        children: runs.length > 0 ? runs : [runOf('', {})],
      }),
    )
    for (const n of nested) mapList(n, depth + 1, instance, out)
  }
}

/** 表格:全边框 E0E0E0,表头 F7F7F7 底纹,单元格内容走行内映射 */
function mapTable(table: Element, out: DocxChildren): void {
  const rows = [...table.querySelectorAll('tr')].map((tr) => {
    const cells = [...tr.children]
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      .map((cell) => {
        const runs: ParagraphChild[] = []
        for (const c of cell.childNodes) inlineRuns(c, {}, runs)
        return new TableCell({
          shading:
            cell.tagName === 'TH' ? { type: ShadingType.CLEAR, fill: 'F7F7F7' } : undefined,
          children: [new Paragraph({ spacing: LINE_BODY, children: runs.length > 0 ? runs : [runOf('', {})] })],
        })
      })
    return new TableRow({ children: cells })
  })
  if (rows.length === 0) return
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'E0E0E0' } // 0.5pt ≈ 1px
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows,
    }),
  )
}

/** 块级分派:标题/段落/引用/代码/列表/表格/图片/hr/降级 */
function mapBlock(el: Element, depth: number, out: DocxChildren, olSeq: OlSeq): void {
  switch (el.tagName) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const d = Number(el.tagName[1])
      const runs: ParagraphChild[] = []
      for (const c of el.childNodes) inlineRuns(c, { bold: true, color: HEADING_COLOR, size: H_SIZE[d] }, runs)
      out.push(
        new Paragraph({
          // HeadingLevel.HEADING_1 的值是 "Heading1"——须用枚举成员(键名直传会原样入 XML)
          heading: ([HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6] as const)[d - 1],
          spacing: { before: 240, after: 120, ...LINE_BODY },
          children: runs.length > 0 ? runs : [runOf('', {})],
        }),
      )
      return
    }
    case 'P': {
      const runs: ParagraphChild[] = []
      for (const c of el.childNodes) inlineRuns(c, {}, runs)
      if (runs.length > 0) out.push(new Paragraph({ spacing: { before: 120, after: 120, ...LINE_BODY }, children: runs }))
      return
    }
    case 'BLOCKQUOTE':
      mapQuote(el, 0, out, olSeq)
      return
    case 'PRE':
      mapPre(el, out)
      return
    case 'UL':
    case 'OL': {
      // 顶层列表入口领新编号实例(mapList 内只对 OL 应用——UL 无编号连续问题,
      // 其让出的号位仅是跳号,无害;不用三元分支是守 mapBlock 认知复杂度阈值)
      const instance = olSeq.next++
      mapList(el, depth, instance, out)
      return
    }
    case 'TABLE':
      mapTable(el, out)
      return
    case 'IMG': {
      const img = imageRunOf(el as HTMLImageElement)
      if (img !== null) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 }, children: [img] }))
      else console.warn('docxExport:图片 src 非 data URL,已跳过', el.getAttribute('src'))
      return
    }
    case 'HR':
      out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E5E5', space: 1 } } }))
      return
    default: {
      // 未覆盖标签降级纯文本段(内容不丢);空壳(如被剥净的容器)静默跳过
      const text = (el.textContent ?? '').trim()
      if (text === '') return
      console.warn(`docxExport:未覆盖标签 <${el.tagName.toLowerCase()}>,已按纯文本段落降级`)
      out.push(new Paragraph({ spacing: LINE_BODY, children: [runOf(el.textContent ?? '', {})] }))
    }
  }
}

/** 列表编号配置(4 级:无序圆点/有序十进制,0.25in 步进缩进) */
function numberingConfig() {
  const level = (lvl: number) => ({ left: 360 * (lvl + 2), hanging: 360 })
  return {
    config: [
      {
        reference: 'zen-ul',
        levels: [0, 1, 2, 3].map((lvl) => ({
          level: lvl,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.START,
          style: { paragraph: { indent: level(lvl) } },
        })),
      },
      {
        reference: 'zen-ol',
        levels: [0, 1, 2, 3].map((lvl) => ({
          level: lvl,
          format: LevelFormat.DECIMAL,
          text: `%${lvl + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: level(lvl) } },
        })),
      },
    ],
  }
}

/** 渲染正文体 → .docx 字节:A4 + 2.5cm 边距,title 元数据 = mapName。
 *  Packer.toBlob 走全局 Blob(浏览器/jsdom 均有;若测试环境缺 arrayBuffer 再评估
 *  toBuffer 兜底——勿在生产分支引入 Buffer 依赖) */
export async function buildDocxFromBody(body: HTMLElement, mapName: string): Promise<Uint8Array> {
  const children: DocxChildren = []
  const olSeq: OlSeq = { next: 0 }
  for (const el of blockChildren(body)) mapBlock(el, 0, children, olSeq)
  if (children.length === 0) children.push(new Paragraph({ spacing: LINE_BODY, children: [runOf('', {})] }))
  const doc = new Document({
    title: mapName,
    numbering: numberingConfig(),
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: {
              top: convertMillimetersToTwip(25),
              bottom: convertMillimetersToTwip(25),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
            },
          },
        },
        children,
      },
    ],
  })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
