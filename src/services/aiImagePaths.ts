// src/services/aiImagePaths.ts —— 复制 md 给 AI：图片引用相对→绝对（2026-09）
// 消费者为 Claude Code 等有文件访问权的 agent：不输出 base64（巨量无效 token），md 内
// assets/ 相对路径（事实源形态）统一解析为本机绝对路径；Windows 反斜杠归一正斜杠，
// 含空白以 <...> 包裹（CommonMark 链接目标含空格的合法形态）。无本地图片引用时原文
// 恒等——不硬塞头注占行。头注为 `> ` 引用行，须在 applyCopySettings（剥备注）之后调用。

/** 图片标记（与 imageMarkers.ts 提取同口径：src 允许空格、不含 ) 与换行） */
const IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g

/** src 带协议前缀（http(s)/data/file 等）：外链与内嵌不动——无本地路径可读。
 *  协议段至少两字符（`+`）：单字母冒头必是 Windows 盘符（`D:\…`），落入下方绝对路径分支 */
const hasScheme = (src: string): boolean => /^[a-z][a-z0-9+.-]+:/i.test(src)

/** 已是绝对路径（Unix / 开头、UNC //、Windows 盘符）：不拼 wsDir，仅归一分隔符 */
const isAbsolutePath = (src: string): boolean => src.startsWith('/') || /^[a-z]:\//i.test(src)

/** src → 正斜杠绝对形态：反斜杠全部归一 /，相对则拼归一后的 wsDir 前缀 */
function toSlashAbs(src: string, wsDir: string): string {
  const slash = src.replaceAll('\\', '/')
  return isAbsolutePath(slash) ? slash : `${wsDir.replaceAll('\\', '/')}/${slash}`
}

/** 引用目标形态：含空白 → <...> 包裹（路径字符集不含 <>，Windows 文件名非法字符） */
const linkTarget = (abs: string): string => (/\s/.test(abs) ? `<${abs}>` : abs)

/** 头部说明行（发给 AI 的自述），仅在产出本地绝对路径引用时前置 */
export const AI_IMAGE_HEADER = '> 图片为本地绝对路径，请用工具读取'

/** 图片引用相对→绝对 + 头部说明（AI 消费者）；无本地图片引用时原文恒等 */
export function absolutizeImagePaths(md: string, wsDir: string): string {
  let hits = 0
  const out = md.replace(IMAGE_RE, (m, alt: string, src: string) => {
    if (hasScheme(src)) return m
    hits += 1
    return `![${alt}](${linkTarget(toSlashAbs(src, wsDir))})`
  })
  return hits > 0 ? `${AI_IMAGE_HEADER}\n\n${out}` : out
}
