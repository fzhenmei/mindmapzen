// src/components/BasketTargetPicker.tsx —— 挂载目标选择器（spec §4.4）：两级浮层，
// ① 选图（搜索、排除篮子自身）→ ② 选节点（该图大纲树，文本过滤）。
// 产出 MountTarget 文本寻址器；节点行 testid 用节点文本（用例可见）
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { useAppStore } from '../store/appStore'
import { basketAbsPath, readMapTree } from '../services/basket'
import type { MountTarget } from '../services/basketMount'
import type { ZenNode } from '../types/tree'

interface Props {
  open: boolean
  onPick(t: MountTarget): void
  onClose(): void
}

/** 大纲树扁平化：{path(父链), text, depth}（含父链以便产出寻址器）。
 *  path 链**含根文本**、末项 = 目标节点的父——与 T2 findZenNodeByPathText 的定位口径严格自洽 */
interface OutlineRow {
  path: string[]
  text: string
  depth: number
}

function flatten(node: ZenNode, path: string[], depth: number, out: OutlineRow[]): void {
  for (const c of node.children) {
    out.push({ path, text: c.text, depth })
    flatten(c, [...path, c.text], depth + 1, out)
  }
}

export default function BasketTargetPicker({ open, onPick, onClose }: Readonly<Props>) {
  const { t } = useTranslation()
  const maps = useAppStore((s) => s.maps)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const basketRelPath = useAppStore((s) => s.basketRelPath)
  const [pickedMap, setPickedMap] = useState<string | null>(null)
  const [mapQuery, setMapQuery] = useState('')
  const [nodeQuery, setNodeQuery] = useState('')
  const [rows, setRows] = useState<OutlineRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 读盘轮次票号：在途响应只在票号仍为最新时落地（见 pickMap） */
  const reqSeq = useRef(0)

  // 一轮选择完成即复位（下次打开从选图开始）；票号一并自增，使在途读盘的响应作废
  useEffect(() => {
    if (!open) {
      reqSeq.current += 1
      setPickedMap(null)
      setMapQuery('')
      setNodeQuery('')
      setRows(null)
      setLoadError(null)
    }
  }, [open])

  const basketAbs = workspaceDir !== null && basketRelPath !== null ? basketAbsPath(workspaceDir, basketRelPath) : null
  // 篮子自身不可作目标（spec §4.4）：按绝对路径排除，而非按名——同名图（如子目录里的同名导图）仍可选
  const candidates = useMemo(
    () => maps.filter((m) => m.mdPath !== basketAbs).filter((m) => mapQuery === '' || m.name.includes(mapQuery)),
    [maps, basketAbs, mapQuery],
  )

  const pickMap = (mdPath: string): void => {
    const seq = ++reqSeq.current
    setPickedMap(mdPath)
    setRows(null)
    setLoadError(null)
    void (async () => {
      const fs = useAppStore.getState().adapter
      try {
        const tree = await readMapTree(fs, mdPath)
        // 票号过期即丢弃：用户在读盘期间关闭浮层/另选了图，陈旧大纲会与新 pickedMap 错配
        //（产出的寻址器 mapPath 与 path/text 分属两图 = 挂到错节点上），宁可空表不可串图
        if (seq !== reqSeq.current) return
        if (tree === null) {
          setLoadError(t('basket.picker.loadFailed'))
          return
        }
        const out: OutlineRow[] = []
        flatten(tree, [tree.text], 1, out)
        setRows(out)
      } catch (e) {
        // 出口：日志留线索 + 界面态（readMapTree 已自兜读/解析失败，此处兜非预期的构造期抛出）
        console.error('篮子目标选择器：目标图大纲构建异常', mdPath, e)
        if (seq !== reqSeq.current) return
        setLoadError(t('basket.picker.loadFailed'))
      }
    })()
  }

  const visibleRows = (rows ?? []).filter((r) => nodeQuery === '' || r.text.includes(nodeQuery))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-label={t('basket.picker.title')} className="sm:max-w-lg" data-testid="basket-picker">
        <DialogTitle>{t('basket.picker.title')}</DialogTitle>
        {pickedMap === null ? (
          <div className="flex flex-col gap-2">
            <input
              value={mapQuery}
              placeholder={t('basket.picker.searchMap')}
              className="rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring"
              onChange={(e) => setMapQuery(e.target.value)}
            />
            {candidates.length === 0 && <p className="text-sm text-muted-foreground">{t('basket.picker.noMap')}</p>}
            <ul className="max-h-64 overflow-auto">
              {candidates.map((m) => (
                <li key={m.mdPath}>
                  <button
                    type="button"
                    data-testid={`picker-map-${m.name}`}
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => pickMap(m.mdPath)}
                  >
                    {m.name}
                    {m.relDir !== '' && <span className="ml-2 text-xs text-muted-foreground">{m.relDir}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              data-testid="picker-search"
              value={nodeQuery}
              placeholder={t('basket.picker.searchNode')}
              className="rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring"
              onChange={(e) => setNodeQuery(e.target.value)}
            />
            {loadError !== null && (
              <p role="alert" className="text-xs text-destructive">
                {loadError}
              </p>
            )}
            <ul className="max-h-64 overflow-auto">
              {visibleRows.map((r, i) => (
                <li key={`${r.text}-${i}`}>
                  <button
                    type="button"
                    data-testid={`picker-node-${r.text}`}
                    style={{ paddingLeft: `${r.depth * 12}px` }}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => onPick({ mapPath: pickedMap, path: r.path, text: r.text })}
                  >
                    {r.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
