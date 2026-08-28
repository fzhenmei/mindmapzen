import { useEffect, useRef } from 'react'
import MindMap from 'simple-mind-map'
import type { EngineNode, MindMapHandle } from '../types/engine'
import { handleEngineKeyDown } from './engineKeyboard'

interface Props {
  tree: EngineNode
  onReady: (mm: MindMapHandle) => void
  onDataChange: () => void
}

/** 引擎画布封装：挂载建实例、卸载销毁；父组件用 key={mdPath} 切换文档。
 *  本组件不做单元测试（引擎依赖真实 DOM 布局），由 E2E 与手工清单覆盖。 */
export default function MindMapCanvas({ tree, onReady, onDataChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<MindMapHandle | null>(null)

  useEffect(() => {
    const mm = new MindMap({ el: containerRef.current!, data: tree })
    mmRef.current = mm
    const changed = () => onDataChange()
    mm.on('data_change', changed)
    onReady(mm)
    return () => {
      mm.off('data_change', changed)
      mm.destroy()
      mmRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时初始化，文档切换由父组件 key 重挂载实现
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const handled = handleEngineKeyDown(
      (cmd) => mmRef.current?.execCommand(cmd),
      e.target as HTMLElement | null,
      e.key,
    )
    if (handled) e.preventDefault()
  }

  return <div ref={containerRef} onKeyDown={onKeyDown} style={{ width: '100%', height: '100%' }} />
}
