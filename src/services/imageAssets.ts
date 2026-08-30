// src/services/imageAssets.ts —— 插图资产服务（M19）
// md 事实源存相对路径（AI 可见），画布渲染经引擎 imgMap（src→dataURL）——本服务构建该表：
// 收集树内全部 image.src → readBytes → dataURL + 字节头尺寸解析。单图失败宽容跳过
//（md 标记保留，节点不渲图——重开再试）；资产目录约定工作区 assets/（插入时复制入内）。
import type { FsAdapter } from '../types/files'
import type { ZenNode } from '../types/tree'
import type { ImageMetaEntry } from './mdTree'
import { mimeOf, parseImageSize } from './imageMeta'
import { joinPath } from './workspace'

/** 插图资产目录名（相对工作区；插入图片复制入内，md 引用其相对路径） */
export const ASSETS_DIR = 'assets'

/** 收集树内全部 image.src（去重） */
export function collectImageSrcs(tree: ZenNode, out: Set<string> = new Set()): Set<string> {
  if (tree.image !== undefined) out.add(tree.image.src)
  for (const c of tree.children) collectImageSrcs(c, out)
  return out
}

/** bytes → base64（分块编码，避开大数组 String.fromCharCode 栈溢出） */
function toBase64(bytes: Uint8Array): string {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCodePoint(...bytes.subarray(i, i + chunk))
  }
  return btoa(out)
}

/** 构建插图渲染元数据表：src → { dataUrl, size }；读取失败/无法解析尺寸的宽容跳过
 *  （尺寸未知回退 96×96 估读——custom:false 下引擎按主题上限等比缩放兜底） */
export async function buildImageMeta(
  fs: FsAdapter,
  wsDir: string,
  tree: ZenNode,
): Promise<Map<string, ImageMetaEntry>> {
  const map = new Map<string, ImageMetaEntry>()
  for (const src of collectImageSrcs(tree)) {
    try {
      const bytes = await fs.readBytes(joinPath(wsDir, src))
      const mime = mimeOf(src)
      const size = parseImageSize(bytes) ?? { width: 96, height: 96 }
      map.set(src, { dataUrl: `data:${mime};base64,${toBase64(bytes)}`, size })
    } catch {
      // 文件缺失/不可读：跳过（节点不渲图，md 标记保留）
    }
  }
  return map
}
