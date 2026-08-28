/** 多行文本拆分为行数组：行尾归一化、去首尾空白、丢弃空行（spec §3.6） */
export function splitMultilineText(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}
