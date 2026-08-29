/** 多行文本拆分为行数组：行尾归一化、去首尾空白、丢弃空行（spec §3.6） */
export function splitMultilineText(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
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
