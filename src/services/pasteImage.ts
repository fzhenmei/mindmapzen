// src/services/pasteImage.ts —— 剪贴板粘贴截图（节点插图）
// Ctrl+V：ImageDialog 的 paste 事件同步读 clipboardData.items（WebView2 会把微信/QQ
// 剪贴板位图合成 image/png 条目，此路径最可靠）。「粘贴」按钮：无 paste 事件可用，
// 生产经 Tauri 插件 readImage 取 RGBA 裸像素，再 Canvas 编码 PNG 落 assets/。
// 两路径文件名统一 paste-<时间戳>.<ext>（与选图「防撞名」逻辑在 useImageEdit 共用）。

import { i18n } from '../i18n'

/** mime → 文件后缀（与 App 选图过滤器一致的已知集合；未知回退 png） */
export function extOfMime(mime: string): string {
  switch (mime.toLowerCase().split(';')[0].trim()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/bmp':
      return 'bmp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

/** 粘贴文件名：paste-YYYYMMDD-HHMMSS.<ext>（本地时间，秒级可读） */
export function pasteImageName(ext: string): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `paste-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`
}

/** 从 paste 事件读图：items 里第一个 image/* 条目 → { name, bytes }；无图/读取失败 null。
 *  e 参数结构化为「只要 clipboardData」，便于单测以 mock 对象驱动 */
export async function bytesFromPasteEvent(e: {
  clipboardData: DataTransfer | null
}): Promise<{ name: string; bytes: Uint8Array } | null> {
  const items = e.clipboardData?.items
  if (items === undefined) return null
  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file === null) continue
    return { name: pasteImageName(extOfMime(item.type)), bytes: new Uint8Array(await file.arrayBuffer()) }
  }
  return null
}

/** RGBA 裸像素（行主序自上而下）→ PNG 字节：Canvas putImageData + toBlob 编码。
 *  仅生产「粘贴」按钮路径使用（Tauri readImage 返回 RGBA，须编码成文件格式落盘）。 */
export async function rgbaToPngBytes(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error(i18n.t('errors.canvas2dUnavailable'))
  // 复制一份进全新 Uint8ClampedArray（TS 5.7+ ImageData 要求 ArrayBuffer，绕开 ArrayBufferLike 视图问题）
  const pixels = new Uint8ClampedArray(rgba.byteLength)
  pixels.set(rgba)
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b === null ? reject(new Error(i18n.t('errors.pngEncodeFail'))) : resolve(b)), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
