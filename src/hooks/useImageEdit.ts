// src/hooks/useImageEdit.ts —— 节点插图编辑（M19 想法10）
// 打开：取选中节点现状（data.image/imageTitle）+ 预览 dataURL（工作区读 bytes）。
// 选择图片：pickImageFile（生产 Tauri 对话框，E2E 桩）→ 复制入工作区 assets/（防撞名）
// → 引擎 renderTree.data.imgMap 运行时注入 src→dataURL（getImageUrl 查表口径，
// nodeCreateContents.js:41-44）→ SET_NODE_IMAGE（含 imageSize，custom:false 主题等比缩放）。
// 移除：SET_NODE_IMAGE 空。保存链经无载荷 onDataChanged（md 行尾 ![alt](src) 是唯一事实源）
import { useCallback, useRef, useState } from 'react'
import type { MindMapHandle } from '../types/engine'
import type { NodeImage } from '../services/imageMarkers'
import { mimeOf, parseImageSize } from '../services/imageMeta'
import { ASSETS_DIR } from '../services/imageAssets'
import { joinPath } from '../services/workspace'
import type { FsAdapter } from '../types/files'

/** 选图来源（App 装配注入；E2E 桩返回固定字节） */
export interface PickedImage {
  name: string
  bytes: Uint8Array
}

export interface ImageEditState {
  open: boolean
  nodeText: string
  current: NodeImage | null
  /** 当前图预览 dataURL（打开时异步构建；null = 无图或不可读） */
  preview: string | null
  openDialog(text: string, image: NodeImage | null): void
  close(): void
  /** 选新图：复制入 assets/ 并应用；返回 src（null = 取消/失败） */
  pickAndApply(): Promise<string | null>
  /** 移除插图 */
  remove(): void
}

function toBase64(bytes: Uint8Array): string {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCodePoint(...bytes.subarray(i, i + chunk))
  return btoa(out)
}

/** 引擎整树深找 uid 命中节点（与 useIconPicker 的 findByUid 同构，局部独立实现） */
function findByUid(root: { data: { uid?: unknown; text?: unknown }; children?: unknown[] }, uid: string | null): unknown {
  if (uid === null) return null
  if (root.data.uid === uid) return root
  for (const c of root.children ?? []) {
    const hit = findByUid(c as typeof root, uid)
    if (hit !== null) return hit
  }
  return null
}

/** 选中节点现状插图（data.image/imageTitle → NodeImage；无图 null） */
export function nodeImageOf(mm: MindMapHandle | null, uid: string | null): NodeImage | null {
  const n = mm !== null && uid !== null ? (findByUid(mm.getData(), uid) as { data?: { image?: unknown; imageTitle?: unknown } } | null) : null
  if (n?.data !== undefined && typeof n.data.image === 'string' && n.data.image !== '') {
    return { src: n.data.image, alt: typeof n.data.imageTitle === 'string' ? n.data.imageTitle : '' }
  }
  return null
}

export function useImageEdit(
  mmRef: React.RefObject<MindMapHandle | null>,
  uidRef: React.RefObject<string | null>,
  adapter: FsAdapter,
  wsDir: string | null,
  pickImageFile: () => Promise<PickedImage | null>,
  onDataChanged: () => void,
): ImageEditState {
  const [open, setOpen] = useState(false)
  const [nodeText, setNodeText] = useState('')
  const [current, setCurrent] = useState<NodeImage | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const targetUidRef = useRef<string | null>(null)

  const openDialog = useCallback(
    (text: string, image: NodeImage | null) => {
      targetUidRef.current = uidRef.current
      setNodeText(text)
      setCurrent(image)
      setPreview(null)
      setOpen(true)
      // 预览 dataURL（宽容：不可读保持 null 显示占位）
      if (image !== null && wsDir !== null) {
        void adapter
          .readBytes(joinPath(wsDir, image.src))
          .then((b) => setPreview(`data:${mimeOf(image.src)};base64,${toBase64(b)}`))
          .catch(() => setPreview(null))
      }
    },
    [uidRef, adapter, wsDir],
  )

  const close = useCallback(() => setOpen(false), [])

  /** 应用到引擎：imgMap 运行时注入 + SET_NODE_IMAGE（尺寸解析失败回退 96×96） */
  const applyToEngine = useCallback(
    (src: string, alt: string, bytes: Uint8Array) => {
      const mm = mmRef.current
      const uid = targetUidRef.current
      if (mm === null || uid === null) return
      const size = parseImageSize(bytes) ?? { width: 96, height: 96 }
      // imgMap 运行时注入（getImageUrl 读 renderer.renderTree.data.imgMap；无则建）
      const tree = (mm as unknown as { renderer?: { renderTree?: { data?: Record<string, unknown> } } }).renderer
        ?.renderTree?.data
      if (tree !== undefined) {
        const map = (tree.imgMap as Record<string, string> | undefined) ?? {}
        map[src] = `data:${mimeOf(src)};base64,${toBase64(bytes)}`
        tree.imgMap = map
      }
      mm.execCommandImage?.(uid, { image: src, imageTitle: alt, imageSize: { ...size, custom: false } })
      onDataChanged()
    },
    [mmRef, onDataChanged],
  )

  const pickAndApply = useCallback(async (): Promise<string | null> => {
    if (wsDir === null) return null
    const picked = await pickImageFile()
    if (picked === null) return null
    // 复制入 assets/（防撞名：同名已存在则加 -N 序号）
    const dot = picked.name.lastIndexOf('.')
    const stem = dot > 0 ? picked.name.slice(0, dot) : picked.name
    const ext = dot > 0 ? picked.name.slice(dot + 1).toLowerCase() : 'png'
    let src = `${ASSETS_DIR}/${stem}.${ext}`
    let n = 1
    while (await adapter.exists(joinPath(wsDir, src))) {
      n += 1
      src = `${ASSETS_DIR}/${stem}-${n}.${ext}`
    }
    await adapter.ensureDir(joinPath(wsDir, ASSETS_DIR))
    await adapter.writeBytes(joinPath(wsDir, src), picked.bytes)
    applyToEngine(src, stem, picked.bytes)
    setCurrent({ src, alt: stem })
    // 预览同步更新（openDialog 只构建一次现状图，选新图后须刷新）
    setPreview(`data:${mimeOf(src)};base64,${toBase64(picked.bytes)}`)
    return src
  }, [wsDir, pickImageFile, adapter, applyToEngine])

  const remove = useCallback(() => {
    const mm = mmRef.current
    const uid = targetUidRef.current
    setOpen(false)
    if (mm === null || uid === null) return
    mm.execCommandImage?.(uid, { image: '', imageTitle: '', imageSize: { width: 96, height: 96, custom: false } })
    onDataChanged()
  }, [mmRef, onDataChanged])

  return { open, nodeText, current, preview, openDialog, close, pickAndApply, remove }
}
