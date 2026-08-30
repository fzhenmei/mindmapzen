// src/services/fileSize.ts —— 文件大小中文格式化（M15 资源管理器 tile 摘要）
// B/KB/MB 三档够用（导图 md 均为 KB 级；GB 级分支按同规则外推防御性保留）。
// KB 阈值取 1024（与资源管理器一致）；一位小数，整数档不显示小数位。

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** 字节数 → 中文单位字符串：0 → '0 B'；1023 → '1023 B'；1536 → '1.5 KB' */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let v = bytes
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i += 1
  }
  // 一位小数后去尾零（12.0 KB → 12 KB）
  const s = v >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1)
  return `${s} ${UNITS[i]}`
}
