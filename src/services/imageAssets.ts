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

/** 防撞名落盘入 assets/（同名已存在则加 -N 序号）；wsDir 为空返回 null 兜底。
 *  节点插图（useImageEdit）与正文插图（VditorEditor 上传）共用 */
export async function writeImageAsset(
  fs: FsAdapter,
  wsDir: string | null,
  name: string,
  bytes: Uint8Array,
): Promise<{ src: string; stem: string } | null> {
  if (wsDir === null) return null
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : 'png'
  let src = `${ASSETS_DIR}/${stem}.${ext}`
  let n = 1
  while (await fs.exists(joinPath(wsDir, src))) {
    n += 1
    src = `${ASSETS_DIR}/${stem}-${n}.${ext}`
  }
  await fs.ensureDir(joinPath(wsDir, ASSETS_DIR))
  await fs.writeBytes(joinPath(wsDir, src), bytes)
  return { src, stem }
}

/** md 全文图片引用 src 收集（2026-09 正文插图）：`![alt](src)` 全文匹配（含引用块/
 *  正文内），只收相对路径——外链（http/data: 等协议头）与绝对路径（/、盘符）不收，
 *  与 buildImageMeta 的相对口径一致。标题行尾节点标记（extractImageMarker）是它的
 *  子集，消费方（FileDetail/wechatCopy 预览图收集）统一升级为本口径后正文图同渲 */
const MD_IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g
/** src 是否相对路径（排除协议头外链与绝对路径）——md 收集与 DOM 收集共用口径 */
export const isRelativeImageSrc = (src: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('/') && !/^[a-z]:[\\/]/i.test(src)

export function collectMdImageSrcs(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(MD_IMAGE_RE)) {
    const src = m[2] as string
    if (isRelativeImageSrc(src)) out.add(src)
  }
  return out
}

/** src 的百分号解码形态（vditor 预览把非 ASCII src 编码，如 assets/配图.png →
 *  assets/%E9…png）；已损坏的编码序列无解码形态，原样返回（等于未命中） */
export const decodeSrcForm = (src: string): string => {
  try {
    return decodeURIComponent(src)
  } catch {
    return src
  }
}

/** 收集容器内全部相对路径 img src（解码形态、去重）——预览 DOM 后处理用 */
export function collectRelativeImgSrcs(root: ParentNode): Set<string> {
  const out = new Set<string>()
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src')
    if (src === null || src === '') continue
    const dec = decodeSrcForm(src)
    if (isRelativeImageSrc(dec)) out.add(dec)
  }
  return out
}

/** 按表替换容器内 img src（原文与解码形态双比对命中；外链/dataURL 不在表中原样） */
export function applyImgSrcMap(root: ParentNode, map: ReadonlyMap<string, string>): void {
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src')
    if (src === null || src === '') continue
    const hit = map.get(src) ?? map.get(decodeSrcForm(src))
    if (hit !== undefined) img.src = hit
  }
}

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
  return buildImageMetaFromSrcs(fs, wsDir, collectImageSrcs(tree))
}

/** 同上，按 src 集合构建（FileDetail 预览用：md 文本行级收集，无需 parse 成树） */
export async function buildImageMetaFromSrcs(
  fs: FsAdapter,
  wsDir: string,
  srcs: Iterable<string>,
): Promise<Map<string, ImageMetaEntry>> {
  const map = new Map<string, ImageMetaEntry>()
  for (const src of srcs) {
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
