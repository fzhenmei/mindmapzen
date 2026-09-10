// src/services/displayText.ts —— 显示层标记剥离链:md 原文 → 展示文本。
// 连线 [[..]](句中)与行尾 #标签、::图标(图标在标签外侧)三类标记逐行剥净——
// 原内联在 MarkdownPreview,2026-09 发布复制(wechatCopy)需同口径,抽此钉死一处
import { stripIconMarkers } from './iconMarkers'
import { stripMarkers } from './linkMarkers'
import { stripTagMarkers } from './tagMarkers'

/** md 原文 → 显示层文本:逐行过 stripTagMarkers(stripIconMarkers(stripMarkers(l)))。
 *  标记永不跨行;图标在标签外侧,故先剥 icon 再剥 tag(与画布显示层同口径) */
export function toDisplayText(text: string): string {
  return text
    .split('\n')
    .map((l) => stripTagMarkers(stripIconMarkers(stripMarkers(l))))
    .join('\n')
}
