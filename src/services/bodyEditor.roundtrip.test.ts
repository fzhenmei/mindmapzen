// src/services/bodyEditor.roundtrip.test.ts —— 编辑器 md⇄编辑器⇄md roundtrip 契约(2026-09 正文功能选型验证)
// 用例集长期保留:锁住依赖升级不引入 roundtrip 漂移。
//
// ===== 实测结论(2026-09-05,Go/No-Go 关口):Milkdown No-Go → Tiptap 路线 Go =====
// 一、Milkdown(@milkdown/core|preset-commonmark|preset-gfm|plugin-listener 7.22.1,均 MIT)→ No-Go:
//   1. roundtrip 8 例中 6 例恒等(仅文末多一个换行,属允许的行尾空白);「表格」「组合」两例
//      分隔行漂移:| --- | → | - |。源码级确认(markdown-table:分隔行短横线数 = max(1, 列宽),
//      列宽取该列最长单元格):remark-gfm 的 tableCellPadding/tablePipeAlign/stringLength 均无
//      「最短 3」能力,强设列宽≥3 会把数据行填充成 | a   |,漂移更大。按判据(仅行尾空白
//      允许)记 No-Go 证据,milkdown 四包已卸载。
//   2. 其禁用机制本身可用但费工:v7.22 无 configure(commonmark, { heading: false }) 之类的
//      特性开关(那是 Crepe 高层包的 API);原始 kit 需按引用过滤预设插件数组(必须连带剔除
//      急切取 schema 的 inputRule/$prose 件,否则 create() 抛 slice 错),且 parser 对无 schema
//      认领的 mdast 节点直接抛 parserMatchError,还需自写 remark 变换把 heading/list 字面化为
//      段落。实测输出 '\# x\n\n\- y'(转义保字面,再 parse 无 heading/list 节点)。
// 二、Tiptap(@tiptap/core|pm|starter-kit|extension-table 3.31.3 + tiptap-markdown 0.9.0,均 MIT)→ Go:
//   1. roundtrip:8/8 逐字节恒等,且 getMarkdown() 原始输出不带尾换行,零规范化即恒等
//      (代码块保 ```lang;tiptap-markdown 表格分隔行硬编码 ---;行内标记/链接/引用全保真)。
//   2. 禁用 heading/list = 双管齐下,缺一不可:
//      ① StarterKit.configure({ heading/bulletList/orderedList/listItem: false }) 移除节点与输入规则;
//      ② 经 parse.setup 钩子 md.disable(['heading','lheading','list']) 禁 markdown-it 块规则
//         (仅①时 # x 被渲染成 <h1> 后无 parseDOM 规则认领,标记字符丢失)。
//      实测输出 '\# x\n\n\- y'(prosemirror-markdown 对行首 #/- 转义),再 parse 无 heading/list 节点。
// 三、Task 5(BodyEditor 组件封装)依据:
//   - 装配:[StarterKit, TableKit, Markdown];content 传 md 字符串即自动 parse;
//     取值 editor.storage.markdown.getMarkdown(),输出无需任何后处理;
//   - 禁块:扩展 configure 关节点 + literalBlocks 扩展禁 md 块规则(本文件 literalBlocks 常量);
//   - 依赖全 MIT,满足对外发布合规约束。
import { afterAll, describe, expect, test } from 'vitest'
import { Editor, Extension, type Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'

/** v1 正文支持的块集合(spec §v1 支持的块);每例须 parse→serialize 后与输入恒等
 *  (允许的规范化差异:行尾空白;除此之外任何漂移都算 No-Go 证据) */
const CASES: ReadonlyArray<{ name: string; md: string }> = [
  { name: '中文段落', md: '围绕节点展开的论述。' },
  { name: '多段落', md: '第一段。\n\n第二段。' },
  { name: '粗斜体删除线行内代码', md: '**粗**、*斜*、~~删~~、`code` 混排。' },
  { name: '代码块(含 # 与 - 行)', md: '```js\n# 注释不是标题\n- 不是列表\nconst x = 1\n```' },
  { name: '引用块', md: '> 引用内容' },
  { name: '表格', md: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
  { name: '链接', md: '[文字](https://example.com)' },
  { name: '组合', md: '论述段。\n\n```py\nx = 1\n```\n\n> 引用\n\n| a |\n| --- |\n| b |' },
]

// —— 纯转换路径:每次转换建一个不挂载的 Editor(jsdom 内部自建游离 div),
//    content 传入 md 字符串时 tiptap-markdown 在 onBeforeCreate 里先 parse 成 doc,
//    editor.storage.markdown.getMarkdown() 再序列化回 md,全程不经用户交互。 ——
const editors: Editor[] = []
afterAll(() => {
  editors.forEach((e) => e.destroy())
})
const mdOfEditor = (editor: Editor): string =>
  (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown().replace(/\s+$/, '')
const roundtrip = (md: string, extensions: Extensions): string => {
  const editor = new Editor({ content: md, extensions })
  editors.push(editor)
  return mdOfEditor(editor)
}
const nodeTypesOf = (md: string, extensions: Extensions): Set<string> => {
  const editor = new Editor({ content: md, extensions })
  editors.push(editor)
  const types = new Set<string>()
  editor.state.doc.descendants((n) => {
    types.add(n.type.name)
  })
  return types
}

// —— 禁 heading/list 的装配 ——
// ① 扩展层:StarterKit.configure({ heading/bulletList/orderedList/listItem: false }) 移除节点与输入规则;
// ② 解析层:仍需禁 markdown-it 的块规则(heading/lheading/list),否则 `# x` 被 md 渲染成 <h1>
//    后无 parseDOM 规则认领、标记字符丢失(实测见文件头)。经 tiptap-markdown 的
//    parse.setup 钩子(md 实例上 disable)在 tokenize 阶段就把 # / - 留在段落文本里。
const noHeadingListStarter = StarterKit.configure({
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
})
const literalBlocks = Extension.create({
  name: 'literalBlocks',
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md: { disable: (rules: string[]) => unknown }) {
            md.disable(['heading', 'lheading', 'list'])
          },
        },
      },
    }
  },
})
const FULL: Extensions = [StarterKit, TableKit, Markdown]
const NO_HEADING_LIST: Extensions = [noHeadingListStarter, TableKit, literalBlocks, Markdown]

describe('编辑器 roundtrip(spec v1 块集合)', () => {
  test('parse→serialize 与输入恒等', async () => {
    for (const c of CASES) {
      const out = roundtrip(c.md, FULL)
      expect(out, `用例「${c.name}」`).toBe(c.md)
    }
  })

  test('禁用 heading/list 后,# 行与 - 行不再构成结构', async () => {
    const out = roundtrip('# x\n\n- y', NO_HEADING_LIST)
    // 实测行为断言(见文件头):# 与 - 以字面文本留存;markdown 序列化不含 HTML 标签,
    // brief 的 not.toContain('<h1') 以结构级断言替代:输出再 parse 回来不出现
    // heading/bulletList/orderedList/listItem 节点。
    expect(out).toContain('# x')
    expect(out).toContain('- y')
    const types = nodeTypesOf(out, NO_HEADING_LIST)
    for (const banned of ['heading', 'bulletList', 'orderedList', 'listItem']) {
      expect(types.has(banned), `再 parse 后出现 ${banned} 节点`).toBe(false)
    }
  })
})
