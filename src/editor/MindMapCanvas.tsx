import { useEffect, useRef } from 'react'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import type { EngineNode, MindMapHandle } from '../types/engine'
import { handleEngineKeyDown } from './engineKeyboard'

// 节点拖拽插件：拖到节点上=成为其子节点，拖到两节点之间=调整同级顺序（spec P0"拖拽节点改变层级与顺序"）
// eslint-disable-next-line react-hooks/rules-of-hooks -- 引擎静态注册 API，非 React Hook（use 前缀误报）
MindMap.usePlugin(Drag)

interface Props {
  tree: EngineNode
  onReady: (mm: MindMapHandle) => void
  onDataChange: () => void
}

/** 引擎画布封装：挂载建实例、卸载销毁；父组件用 key={mdPath} 切换文档。
 *  本组件不做单元测试（引擎依赖真实 DOM 布局），由 E2E 与手工清单覆盖。 */
export default function MindMapCanvas({ tree, onReady, onDataChange }: Readonly<Props>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<MindMapHandle | null>(null)
  // 始终持最新回调：挂载 effect 只订阅一次，避免闭包停留在首帧 props（Task 5 遗留加固）
  const cbRef = useRef({ onReady, onDataChange })
  cbRef.current = { onReady, onDataChange }

  useEffect(() => {
    const mm = new MindMap({ el: containerRef.current!, data: tree })
    mmRef.current = mm
    const changed = () => cbRef.current.onDataChange()
    mm.on('data_change', changed)
    cbRef.current.onReady(mm)

    // 键盘录入走 window 层：焦点在 body/SVG 时容器级监听收不到事件；
    // 引擎编辑框（contenteditable）与按钮等交互元素内不拦截，保证正常输入与 Tab 导航
    const onKeydown = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
        return
      }
      const handled = handleEngineKeyDown((cmd) => mmRef.current?.execCommand(cmd), null, e.key)
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKeydown)

    return () => {
      window.removeEventListener('keydown', onKeydown)
      mm.off('data_change', changed)
      mm.destroy()
      mmRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时初始化，文档切换由父组件 key 重挂载实现
  }, [])

  // role=application：向辅助技术标明这是应用区域（键盘交互在上方 window 监听中处理）
  return <div ref={containerRef} role="application" style={{ width: '100%', height: '100%' }} />
}
