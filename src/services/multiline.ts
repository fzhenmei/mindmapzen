/** 多行文本拆分为行数组：行尾归一化、去首尾空白、丢弃空行（spec §3.6） */
export function splitMultilineText(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** 节点文本换行归一化（单行语义）：Word 粘贴携带的 \r\n / 裸 \r 及漏网 \n 统一为空格——
 *  残留换行会命中 serialize 的 assertNoNewline 断言（复制/保存抛错，2026-09-07 实案） */
const normalizeNodeText = (text: string): string => text.replace(/\r\n?|\n/g, ' ')

/** 正文/备注换行归一化（多行语义）：\r\n 与裸 \r 归一为 \n——\r 残留会污染 md 落盘
 *  （emitBody 按 \n 拆行原样输出，行尾 \r 重开 parse 后毒害标题文本） */
const normalizeMultiline = (text: string): string => text.replace(/\r\n?/g, '\n')

/** SET_NODE_DATA 载荷形态（text 单行、body/note 多行；其余键原样透传） */
interface NodeDataPayload {
  text?: unknown
  body?: unknown
  note?: unknown
  [key: string]: unknown
}

/** 提交口命令参数归一化（2026-09-07 Word 粘贴毒节点治本）：编辑框提交（SET_NODE_TEXT，
 *  引擎 TextEdit.js:492）与正文弹窗写入（SET_NODE_DATA，useBodyDialog flushNow）是节点
 *  文本/正文的两条入口——在 execCommand 包装层统一剥换行，粘贴口拦截（MindMapCanvas
 *  onPaste）之外的漏网路径在此兜底。非目标命令原样返回 */
export function sanitizeExecArgs(cmd: string, args: unknown[]): unknown[] {
  if (cmd === 'SET_NODE_TEXT' && typeof args[1] === 'string') {
    return [args[0], normalizeNodeText(args[1]), ...args.slice(2)]
  }
  if (cmd === 'SET_NODE_DATA' && args[1] !== null && typeof args[1] === 'object') {
    const data = args[1] as NodeDataPayload
    const out: NodeDataPayload = { ...data }
    if (typeof out.text === 'string') out.text = normalizeNodeText(out.text)
    if (typeof out.body === 'string') out.body = normalizeMultiline(out.body)
    if (typeof out.note === 'string') out.note = normalizeMultiline(out.note)
    return [args[0], out, ...args.slice(2)]
  }
  return args
}

/** 多行粘贴执行（spec §3.6，M5b 自 EditorView 拆出为纯函数）：首行替换被编辑节点文本，
 *  其余行逐个插入其子节点。顺序上必须先关引擎编辑框再 SET_NODE_TEXT：INSERT_CHILD_NODE
 *  内部会调 hideEditTextBox，以编辑框内粘贴前的旧文本提交覆盖首行（TextEdit.js:492，
 *  引擎核验笔记）。无引擎实例/无激活 uid/uid 未命中渲染树均静默放弃（无目标语义） */
export function applyMultilinePaste(
  mm: { execCommand(cmd: string, ...args: unknown[]): void; renderer?: { findNodeByUid(uid: string): unknown; textEdit: { hideEditTextBox(): void } } } | null,
  uid: string | null,
  raw: string,
): void {
  const lines = splitMultilineText(raw)
  if (lines.length === 0 || !mm || !uid) return
  const node = mm.renderer?.findNodeByUid(uid)
  if (!node) return
  mm.renderer?.textEdit.hideEditTextBox()
  mm.execCommand('SET_NODE_TEXT', node, lines[0]!)
  for (const line of lines.slice(1)) {
    mm.execCommand('INSERT_CHILD_NODE', false, [node], { text: line })
  }
}
