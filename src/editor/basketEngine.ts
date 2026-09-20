// src/editor/basketEngine.ts —— 篮子引擎端口工厂（spec §4.2「就近引擎」）：当前图 = 篮子图时由
// EditorView 注册本端口——捕获/删除走引擎命令，内存态与磁盘一致且撤销栈可用；非篮子图不注册，
// T4 的 captureIdea/removeBasketIdeaByText 见端口缺席即落文件层。抽独立模块的动因是
// EditorView 行数护栏（端口本体从该文件移出，视图只留注册/清理两行）
import type { BasketEnginePort } from '../store/appStore'
import type { BasketIdea } from '../services/basket'
import type { MindMapHandle } from '../types/engine'

/** 根的数据子节点（结构性窄类型：只取本端口用到的字段，容忍引擎数据形态差异） */
interface BasketChild {
  data?: { text?: string; uid?: string }
}

/** 引擎根渲染节点 + 其数据子节点表；引擎未就绪/未渲染时 null（端口自陈让位） */
function rootCtx(mm: MindMapHandle | null): { mm: MindMapHandle; root: unknown; children: BasketChild[] } | null {
  const root: unknown = mm?.renderer?.root
  // nodeData.children 与 renderer.renderTree 是同一个数组（MindMapNode.handleData 原样返回入参，
  // MindMapNode.js:205）——即**数据树**，含收起子树；渲染实例的 children 才只见可见节点
  const children = (root as { nodeData?: { children?: BasketChild[] } } | undefined)?.nodeData?.children
  // root 缺席 → children undefined → 非数组即判未就绪（一句覆盖 root 缺失与结构不符两态）
  if (mm === null || mm === undefined || !Array.isArray(children)) return null
  return { mm, root, children }
}

/**
 * 篮子引擎端口工厂：getMm 取当前引擎句柄（EditorView 传 `() => mmRef.current`，切图/重挂后恒新）。
 * 方法只在「引擎就绪但状态不对」时自陈让位（返回 false），**不吞引擎异常**——端口调用点
 * （T4 captureIdea/removeBasketIdeaByText）的 try/catch 是唯一出口，回落文件层会双写
 */
export function createBasketEnginePort(getMm: () => MindMapHandle | null): BasketEnginePort {
  return {
    insertIdea: (idea: BasketIdea): boolean => {
      const ctx = rootCtx(getMm())
      if (ctx === null) return false
      // 新点子在篮子最上（spec §3.2），而引擎插入恒追加末尾（insertChildNode：
      // node.nodeData.children.push，Render.js:951）——插入后把新节点在**数据层**提到首位。
      // 不走 spec 原述的 UP_NODE：该命令按渲染节点实例操作（node.parent/node.isRoot，Render.js:1066），
      // 而新节点的实例要等下一次 render（render() 走 setTimeout 0 + 布局 asyncRun，Render.js:553）
      // 才存在，同步传数据节点在引擎里即 TypeError。数据层 splice 与 UP_NODE 对
      // parent.nodeData.children 的改动等价（同一个数组），待渲染按新序出图；撤销快照走 Command
      // 的尾沿节流 addHistory（addHistoryTime 100ms），定时器此刻尚未触发 → 快照已含提序结果，
      // 仍是「一条插入」的历史记录
      const before = ctx.children.length
      ctx.mm.execCommand('INSERT_CHILD_NODE', false, [ctx.root], {
        text: idea.text,
        ...(idea.body !== undefined ? { body: idea.body } : {}),
      })
      // 长度未增（引擎静默早退）即不搬动：pop 会误摘既有条目。此路返回 false 让位文件层——
      // 报 true 会让 T4 以为已入篮而不再落文件，点子静默丢失（假成功）
      const created = ctx.children.length === before + 1 ? ctx.children.pop() : undefined
      if (created !== undefined) ctx.children.unshift(created)
      return created !== undefined
    },
    removeIdeaByText: (text: string): boolean => {
      const ctx = rootCtx(getMm())
      if (ctx === null) return false
      // 根下首个文本命中 → uid → 渲染实例：REMOVE_NODE 收实例（removeNode：node.isRoot/getData，
      // Render.js:1413）。传数据节点不会报错而是**静默不删**（removeFromParentNodeData 首行
      // `if (!node || !node.parent) return`，utils/index.js:1166；唯恰有编辑框开在同一节点时才因
      // getData 抛错，Render.js:1434）——静默不删会让上层误判成功、文件层也不再兜底，故必须取实例；
      // 实例查不到（根被收起，子节点不在渲染树）即让位文件层
      const uid = ctx.children.find((c) => c.data?.text === text)?.data?.uid
      const node = typeof uid === 'string' ? ctx.mm.renderer?.findNodeByUid(uid) : null
      if (node === null || node === undefined) return false
      ctx.mm.execCommand('REMOVE_NODE', [node])
      return true
    },
  }
}
