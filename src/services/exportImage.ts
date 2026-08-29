// src/services/exportImage.ts —— 导出与复制为图片（M5b Task 5）的纯服务层。
// 引擎核验（docs/notes/engine-api.md「M5b 核验 (a)」）：doExport.png()/svg() 返回
// base64 data URL 字符串而非 Blob（png 链路 canvas.toDataURL 直出、svg 链路 readBlob
// 误名实为 readAsDataURL），故转换函数是 dataUrlToBytes 而非 blobToBytes。
import type { EngineExport, MindMapHandle } from '../types/engine'

/** 二进制写盘口（FsAdapter.writeBytes 的函数面；测试注入内存捕获） */
export type WriteBytes = (path: string, bytes: Uint8Array) => Promise<void>
/** 图片写剪贴板口（plugin-clipboard-manager writeImage 收 Uint8Array；测试/E2E 注入桩） */
export type WriteImage = (bytes: Uint8Array) => Promise<void>

/** data URL → 原始字节：取逗号后 base64 段 atob 解码，逐字符取码（二进制串码点 0-255） */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 取导出插件实例：未注册（usePlugin(Export) 缺失）即抛中文错误——不静默产出空文件/空剪贴板 */
function requireExport(mm: MindMapHandle): EngineExport {
  if (!mm.doExport) throw new Error('引擎未注册 Export 插件')
  return mm.doExport
}

/** 导出 PNG 到指定路径：引擎整图 png() → data URL 解码 → 二进制写盘 */
export async function exportPngToFile(mm: MindMapHandle, savePath: string, writeBytes: WriteBytes): Promise<void> {
  await writeBytes(savePath, dataUrlToBytes(await requireExport(mm).png()))
}

/** 导出 SVG 到指定路径：svg 名取 savePath 基名（去目录与扩展）——引擎将其写入 svg <title> */
export async function exportSvgToFile(mm: MindMapHandle, savePath: string, writeBytes: WriteBytes): Promise<void> {
  const name = savePath.split(/[\\/]/).pop()!.replace(/\.svg$/i, '')
  await writeBytes(savePath, dataUrlToBytes(await requireExport(mm).svg(name)))
}

/** 复制整图为 PNG 到剪贴板：png() → data URL 解码 → writeImage(Uint8Array) */
export async function copyPngToClipboard(mm: MindMapHandle, writeImage: WriteImage): Promise<void> {
  await writeImage(dataUrlToBytes(await requireExport(mm).png()))
}
