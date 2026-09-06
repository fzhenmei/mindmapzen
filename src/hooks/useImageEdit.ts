// src/hooks/useImageEdit.ts —— 节点插图编辑（M19 想法10 + 粘贴截图）
// 打开：取选中节点现状（data.image/imageTitle）+ 预览 dataURL（工作区读 bytes）。
// 选择图片：pickImageFile（生产 Tauri 对话框，E2E 桩）→ 复制入工作区 assets/（防撞名）
// → 引擎 renderTree.data.imgMap 运行时注入 src→dataURL（getImageUrl 查表口径，
// nodeCreateContents.js:41-44）→ SET_NODE_IMAGE（含 imageSize，custom:false 主题等比缩放）。
// 粘贴截图：Ctrl+V 由 ImageDialog 读 paste 事件交 pasteAndApply；「粘贴」按钮走
// readClipboardImage 端口（生产 Tauri readImage+Canvas 编码，E2E 桩）。两路径共用
// applyBytes（防撞名落盘+应用+预览刷新）。移除：SET_NODE_IMAGE 空。
// 保存链经无载荷 onDataChanged（md 行尾 ![alt](src) 是唯一事实源）
import { useCallback, useRef, useState } from 'react'
import { i18n } from '../i18n'
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
  /** 粘贴错误提示（对话框内显示；null = 无） */
  pasteError: string | null
  openDialog(text: string, image: NodeImage | null): void
  close(): void
  /** 选新图：复制入 assets/ 并应用；返回 src（null = 取消/失败） */
  pickAndApply(): Promise<string | null>
  /** 粘贴（bytes 已由粘贴源提取；null = 剪贴板无图）：应用或置错；返回 src（null = 未应用） */
  pasteAndApply(image: PickedImage | null): Promise<string | null>
  /** 「粘贴」按钮：读剪贴板端口并应用（无图/失败置错）；返回 src（null = 未应用） */
  pasteFromClipboard(): Promise<string | null>
  /** 画布贴图（2026-09 宿主接管 Control+v）：防撞名落盘 + 逐 uid 应用（多选批量，引擎
   *  paste 的 activeNodeList.forEach 同语义）；uids 空或工作区缺失静默 no-op */
  pasteToNodes(uids: readonly string[], image: PickedImage): Promise<void>
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
  readClipboardImage: () => Promise<PickedImage | null>,
  onDataChanged: () => void,
): ImageEditState {
  const [open, setOpen] = useState(false)
  const [nodeText, setNodeText] = useState('')
  const [current, setCurrent] = useState<NodeImage | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const targetUidRef = useRef<string | null>(null)

  const openDialog = useCallback(
    (text: string, image: NodeImage | null) => {
      targetUidRef.current = uidRef.current
      setNodeText(text)
      setCurrent(image)
      setPreview(null)
      setPasteError(null)
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

  /** imgMap 运行时注入（getImageUrl 读 renderer.renderTree.data.imgMap；无则建）——
   *  插图对话框与画布贴图共用（md 存相对路径、画布渲 dataURL） */
  const injectImgMap = useCallback(
    (src: string, bytes: Uint8Array) => {
      const mm = mmRef.current
      const tree = (mm as unknown as { renderer?: { renderTree?: { data?: Record<string, unknown> } } }).renderer
        ?.renderTree?.data
      if (tree === undefined) return
      const map = (tree.imgMap as Record<string, string> | undefined) ?? {}
      map[src] = `data:${mimeOf(src)};base64,${toBase64(bytes)}`
      tree.imgMap = map
    },
    [mmRef],
  )

  /** 应用到引擎：imgMap 运行时注入 + SET_NODE_IMAGE（尺寸解析失败回退 96×96） */
  const applyToEngine = useCallback(
    (src: string, alt: string, bytes: Uint8Array) => {
      const mm = mmRef.current
      const uid = targetUidRef.current
      if (mm === null || uid === null) return
      const size = parseImageSize(bytes) ?? { width: 96, height: 96 }
      injectImgMap(src, bytes)
      mm.execCommandImage?.(uid, { image: src, imageTitle: alt, imageSize: { ...size, custom: false } })
      onDataChanged()
    },
    [mmRef, injectImgMap, onDataChanged],
  )

  /** 防撞名落盘入 assets/（同名已存在则加 -N 序号）；wsDir 为空返回 null 兜底——
   *  选图/对话框粘贴/画布贴图共用 */
  const writeAsset = useCallback(
    async (name: string, bytes: Uint8Array): Promise<{ src: string; stem: string } | null> => {
      if (wsDir === null) return null
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : 'png'
      let src = `${ASSETS_DIR}/${stem}.${ext}`
      let n = 1
      while (await adapter.exists(joinPath(wsDir, src))) {
        n += 1
        src = `${ASSETS_DIR}/${stem}-${n}.${ext}`
      }
      await adapter.ensureDir(joinPath(wsDir, ASSETS_DIR))
      await adapter.writeBytes(joinPath(wsDir, src), bytes)
      return { src, stem }
    },
    [wsDir, adapter],
  )

  /** bytes 落盘 + 应用 + 刷新现状/预览（选图与粘贴共用；wsDir 为空返回 null 兜底） */
  const applyBytes = useCallback(
    async (name: string, bytes: Uint8Array): Promise<string | null> => {
      const written = await writeAsset(name, bytes)
      if (written === null) return null
      const { src, stem } = written
      applyToEngine(src, stem, bytes)
      setCurrent({ src, alt: stem })
      // 预览同步更新（openDialog 只构建一次现状图，选新图后须刷新）
      setPreview(`data:${mimeOf(src)};base64,${toBase64(bytes)}`)
      return src
    },
    [writeAsset, applyToEngine],
  )

  const pickAndApply = useCallback(async (): Promise<string | null> => {
    if (wsDir === null) return null
    const picked = await pickImageFile()
    if (picked === null) return null
    return applyBytes(picked.name, picked.bytes)
  }, [wsDir, pickImageFile, applyBytes])

  const pasteAndApply = useCallback(
    async (image: PickedImage | null): Promise<string | null> => {
      if (wsDir === null) return null
      if (image === null) {
        setPasteError(i18n.t('editor.imageDialog.pasteNoImage'))
        return null
      }
      setPasteError(null)
      return applyBytes(image.name, image.bytes)
    },
    [wsDir, applyBytes],
  )

  const pasteFromClipboard = useCallback(async (): Promise<string | null> => {
    if (wsDir === null) return null
    try {
      return await pasteAndApply(await readClipboardImage())
    } catch (e) {
      setPasteError(i18n.t('editor.imageDialog.pasteReadFailed', { reason: String(e) }))
      return null
    }
  }, [wsDir, readClipboardImage, pasteAndApply])

  /** 画布贴图（2026-09 宿主接管 Control+v）：一次落盘 + imgMap 注入一次 + 逐 uid SET_NODE_IMAGE
   *  （引擎 paste 的 activeNodeList.forEach 同语义，多选 = 批量插图）；uids 空/落盘失败静默
   *  no-op（同引擎无选中跳过），不动对话框 UI 态（画布贴图时对话框未开） */
  const pasteToNodes = useCallback(
    async (uids: readonly string[], image: PickedImage): Promise<void> => {
      if (uids.length === 0) return
      const written = await writeAsset(image.name, image.bytes)
      if (written === null) return
      const { src, stem } = written
      const size = parseImageSize(image.bytes) ?? { width: 96, height: 96 }
      injectImgMap(src, image.bytes)
      const mm = mmRef.current
      for (const uid of uids) {
        mm?.execCommandImage?.(uid, { image: src, imageTitle: stem, imageSize: { ...size, custom: false } })
      }
      onDataChanged()
    },
    [writeAsset, injectImgMap, mmRef, onDataChanged],
  )

  const remove = useCallback(() => {
    const mm = mmRef.current
    const uid = targetUidRef.current
    setOpen(false)
    if (mm === null || uid === null) return
    mm.execCommandImage?.(uid, { image: '', imageTitle: '', imageSize: { width: 96, height: 96, custom: false } })
    onDataChanged()
  }, [mmRef, onDataChanged])

  return { open, nodeText, current, preview, pasteError, openDialog, close, pickAndApply, pasteAndApply, pasteFromClipboard, pasteToNodes, remove }
}
