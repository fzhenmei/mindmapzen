// src/hooks/useBodyDialog.ts —— 正文弹窗状态（2026-09 写作）：开闭、防抖写回（500ms）与
// flush（关弹窗/窗口失焦）。命令链：
// SET_NODE_DATA 写 data.body 并同值成对写镜像 data.note（2026-09-06 备注合并：引擎
// 「有 note→挂角标+悬停」原生通道由 note 驱动，body 是事实源；空串两者同置 undefined
// 清除，角标随镜像消失）+ reRenderNodeCheckChange 补重渲（裸命令不重渲染，M5b 核验 13）。
// 深度门禁（Step 0 实测）：引擎节点深度字段为 layerIndex（MindMapNode.js:52，root=0 起），
// mdTree 深度 = layerIndex+1，≥7 进列表层——故 layerIndex≥6 弹窗空态不可编辑
// （spec v1 深度限制；serialize 侧 assertNoBodyInList 抛错兜底防其他写入路径）。
// 2026-09-08 弹窗化：模态一次编辑一个节点，选中联动载入链删除（打开时载入、关闭即结束）。
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MindMapHandle } from '../types/engine'
import { nodeTextOf } from './useIconPicker'

/** 引擎节点实例的最小读取面（MindMapNode：getData(key) 取 data[key]、layerIndex 为深度） */
type EngineNodeLike = { getData?(key: string): unknown; layerIndex?: unknown }

/** 列表层门禁：layerIndex≥6（= mdTree 深度≥7，正文只允许标题层 H1-H6 节点） */
const isListNode = (node: unknown): boolean => {
  const v = (node as EngineNodeLike | null)?.layerIndex
  return typeof v === 'number' && v >= 6
}

export interface BodyDialog {
  /** 弹窗开状态（= bodyDraft !== null；EditorView 据此进 anyDialog 互斥总线） */
  open: boolean
  /** 当前草稿；null = 弹窗关（EditorView 的渲染门） */
  bodyDraft: string | null
  /** 当前编辑节点文本（弹窗标题；'' 兼作「无选中」信号驱动空态文案） */
  nodeText: string
  /** 可编辑信号：无选中或深层列表节点为 false（弹窗出空态文案不渲染编辑器） */
  editable: boolean
  /** 砚栏 btn-body：开 → 载入当前选中；关 → flush 后收起 */
  toggle(): void
  /** 弹窗关闭（×/Esc/遮罩均汇于 onOpenChange(false)）：flush 后收起（不动选中） */
  close(): void
  /** 弹窗编辑器 input：更新草稿并重置 500ms 防抖计时（关弹窗/失焦时 flushNow 兜底） */
  edit(value: string): void
  /** 立即提交当前草稿（若与引擎值有差异）；无草稿/无节点为无害空操作 */
  flushNow(): void
  /** 是否有未提交草稿（终审 I2）：关闭守卫在 dirty 判定前先问——SET_NODE_DATA 置脏经
   *  引擎 data_change 节流异步到达，防抖窗内关窗不能依赖 dirtyRef */
  hasPending(): boolean
}

export function useBodyDialog(
  mmRef: RefObject<MindMapHandle | null>,
  activeUidRef: RefObject<string | null>,
): BodyDialog {
  const [bodyDraft, setBodyDraft] = useState<string | null>(null) // null = 弹窗关
  const [nodeText, setNodeText] = useState('')
  const [editable, setEditable] = useState(false)
  // 打开期间持节点实例：提交命令的第二参（引擎命令按实例寻址）
  const nodeRef = useRef<unknown>(null)
  const pendingRef = useRef<string | null>(null) // 未提交草稿（flush 时与引擎值比对）
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 最近一次 onChange 收到的值：滤掉受控回流的同值回声（Task 5 疑虑③——中间窗可能
  // 多回一次同值 md，幂等无害，但会无谓重置防抖计时），换节点载入时重置
  const lastEmittedRef = useRef<string | null>(null)
  const openRef = useRef(false)
  openRef.current = bodyDraft !== null // 渲染期同步（同 EditorView 的 anyDialogRef 模式）

  /** 立即提交：与引擎 data.body 比对，有变才写（同值幂等跳过）；body 与镜像 note 同一条
   *  SET_NODE_DATA 成对落下（单条撤销记录），reRenderNodeCheckChange 使角标即时增删 */
  const flushNow = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending === null) return
    const mm = mmRef.current
    const node = nodeRef.current as EngineNodeLike | null
    if (!mm || !node) return
    const cur = node.getData?.('body')
    const current = typeof cur === 'string' ? cur : undefined
    const next = pending === '' ? undefined : pending
    if (current === next) return
    // 成对写（2026-09-06 合并）：note 是 body 的镜像，引擎角标/悬停由它驱动——清空时同为 undefined
    mm.execCommand('SET_NODE_DATA', node, { body: next, note: next })
    mm.renderer?.reRenderNodeCheckChange(node)
  }

  /** 载入 uid 指向节点：无命中 → 无选中空态；列表层 → 深层空态；否则预填 data.body */
  const loadNode = (uid: string | null): void => {
    const node = uid ? ((mmRef.current?.renderer?.findNodeByUid(uid) ?? null) as EngineNodeLike | null) : null
    nodeRef.current = node
    lastEmittedRef.current = null
    setNodeText(node === null ? '' : nodeTextOf(mmRef.current ?? null, uid))
    if (node === null || isListNode(node)) {
      setEditable(false)
      setBodyDraft('')
      return
    }
    const cur = node.getData?.('body')
    setEditable(true)
    setBodyDraft(typeof cur === 'string' ? cur : '')
  }

  const edit = (value: string): void => {
    if (lastEmittedRef.current === value) return // 同值回声（见 lastEmittedRef 注释）
    lastEmittedRef.current = value
    pendingRef.current = value
    setBodyDraft(value)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      flushNow()
    }, 500)
  }

  const close = (): void => {
    flushNow()
    setBodyDraft(null)
  }

  /** 未提交草稿查询（终审 I2）：pendingRef 非空即有——供关闭守卫在 dirty 判定前决断 */
  const hasPending = (): boolean => pendingRef.current !== null

  const toggle = (): void => {
    if (openRef.current) {
      close()
      return
    }
    loadNode(activeUidRef.current)
  }

  // 窗口失焦：立即冲刷（防抖中的草稿不因切窗口搁置；hook 内即时 flush 即关弹窗与此处共两处，
  // 卸载不冲——引擎销毁竞态下的写入风险大于 500ms 窗口的丢字概率，保存链另有
  // unmountFlush 兜底）
  useEffect(() => {
    const onBlur = (): void => {
      flushNow()
    }
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载期一次订阅，回调经 ref 闭包读最新
  }, [])

  // 卸载清理（I-1）：只清防抖计时器、不提交——否则返回案头/切导图后 ≤500ms 内 timer
  // 仍触发 flushNow，对已 destroy 的引擎 execCommand（销毁竞态）。「卸载不冲刷」由此
  // 真正兑现；防抖窗内的收尾由关弹窗/窗口失焦兜住
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return { open: bodyDraft !== null, bodyDraft, nodeText, editable, toggle, close, edit, flushNow, hasPending }
}
