// src/services/imageMeta.ts —— 图片字节头尺寸解析（M19 插图）
// 引擎 imageSize 需要真实宽高（custom:false 时按主题上限等比缩放）——这里同步解析
// 字节头（PNG/GIF：定长字段；JPEG：扫 SOFn 段），不依赖 Image 异步加载（树构建是同步链）。
// 不识别的格式返回 null（调用方回退 96×96 估读，主题上限兜底防巨图）。

export interface ImageSize {
  width: number
  height: number
}

/** PNG：IHDR 宽高（字节 16-23，大端） */
function pngSize(b: Uint8Array): ImageSize | null {
  // 签名 89 50 4E 47 0D 0A 1A 0A + IHDR 块长/类型
  if (b.length < 24) return null
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  return { width: be32(b, 16), height: be32(b, 20) }
}

/** GIF：逻辑屏幕尺寸（字节 6-9，小端） */
function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10) return null
  if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null // GIF
  return { width: le16(b, 6), height: le16(b, 8) }
}

/** JPEG：段扫描找 SOFn（C0-CF 除 C4/C8/CC） */
function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 <= b.length) {
    if (b[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = b[i + 1]!
    const len = be16(b, i + 2)
    // SOF0/1/2/3/5/6/7/9/10/11/13/14/15：段内 高(2B) 宽(2B) 大端
    if (
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    ) {
      return { height: be16(b, i + 5), width: be16(b, i + 7) }
    }
    i += 2 + len
  }
  return null
}

/** 大端读数 */
const be32 = (b: Uint8Array, off: number): number =>
  ((b[off] ?? 0) << 24) | ((b[off + 1] ?? 0) << 16) | ((b[off + 2] ?? 0) << 8) | (b[off + 3] ?? 0)
const be16 = (b: Uint8Array, off: number): number => ((b[off] ?? 0) << 8) | (b[off + 1] ?? 0)
const le16 = (b: Uint8Array, off: number): number => ((b[off + 1] ?? 0) << 8) | (b[off] ?? 0)

/** 解析图片字节头尺寸；不支持/解析失败返回 null */
export function parseImageSize(bytes: Uint8Array): ImageSize | null {
  return pngSize(bytes) ?? gifSize(bytes) ?? jpegSize(bytes)
}

/** 图片扩展名 → dataURL MIME（未知扩展名回退 octet-stream——引擎按 URL 加载，宽容） */
export function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'bmp') return 'image/bmp'
  return 'application/octet-stream'
}
