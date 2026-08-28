/** 忽略块类型 → 中文名（spec §3.5 横幅/确认/导入预览共用；未知类型兜底「其他」） */
const ZH: Record<string, string> = {
  paragraph: '段落',
  code: '代码块',
  table: '表格',
  image: '图片',
  blockquote: '引用',
  thematicBreak: '分隔线',
  html: 'HTML',
  list: '列表',
  listItem: '列表项',
}

export function describeIgnoredType(type: string): string {
  return ZH[type] ?? '其他'
}
