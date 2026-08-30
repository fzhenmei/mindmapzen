import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { CURATED_ICONS, loadIconSvg } from '../editor/zenIcons'

interface Props {
  /** 当前节点文本（标题展示） */
  nodeText: string
  /** 当前图标（kebab 名，parse 提取/管理器维护） */
  current: readonly string[]
  onCancel(): void
  /** 确认：新图标名列表 + 本次新引入的图标（非精选集，需运行时注册进引擎 iconList） */
  onConfirm(names: readonly string[], extras: ReadonlyArray<{ name: string; icon: string }>): void
}

/** 搜索命中项：精选直取，全集懒加载（tags.json 名单 + svg 动态 import） */
type GridIcon = { name: string; svg: string | null; loading: boolean }

/** 图标管理器（M18 想法9：节点签名图标的唯一增删 UI 通道）：
 *  精选 64 网格 + 全集搜索（lucide tags.json 懒加载，名字/标签匹配），
 *  点选 toggle 高亮，保存即 SET_NODE_ICON。md 句尾 ::name 标记是事实源，
 *  手写标记同样合法（宽容，与连线手写一致） */
export default function IconPickerDialog({ nodeText, current, onCancel, onConfirm }: Readonly<Props>) {
  const [picked, setPicked] = useState<string[]>([...current])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GridIcon[]>([])

  // 全集名单（tags.json：name → 标签数组）懒加载缓存；仅搜索时拉一次
  useEffect(() => {
    if (query.trim() === '') {
      setResults([])
      return
    }
    let cancelled = false
    void (async () => {
      const tags = (await import('lucide-static/tags.json')) as unknown as Record<string, string[]>
      if (cancelled) return
      const q = query.trim().toLowerCase()
      // 名字含 q 或任一标签含 q；上限 24 个防网格爆炸；精选图标 svg 直取
      const names = Object.keys(tags)
        .filter((n) => n.includes(q) || tags[n]?.some((t) => t.toLowerCase().includes(q)))
        .slice(0, 24)
      setResults(names.map((name) => ({ name, svg: CURATED_ICONS[name] ?? null, loading: true })))
      // 非精选项逐个懒加载 svg（失败宽容置空并从可选中排除）
      for (const name of names) {
        if (CURATED_ICONS[name] !== undefined) continue
        const svg = await loadIconSvg(name)
        if (cancelled) return
        setResults((rs) => rs.map((r) => (r.name === name ? { ...r, svg, loading: false } : r)))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [query])

  const grid = useMemo<GridIcon[]>(
    () =>
      query.trim() === ''
        ? Object.entries(CURATED_ICONS).map(([name, svg]) => ({ name, svg, loading: false }))
        : results,
    [query, results],
  )

  const toggle = (name: string) => {
    if (name === '') return
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]))
  }

  // extras = 本次选中但不在精选集的（已懒加载成功的）
  const extras = picked
    .filter((n) => CURATED_ICONS[n] === undefined)
    .map((n) => results.find((r) => r.name === n))
    .filter((r): r is GridIcon => r !== undefined && r.svg !== null)
    .map((r) => ({ name: r.name, icon: r.svg as string }))

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="icon-dialog" aria-label="节点图标" className="sm:max-w-2xl">
        <DialogTitle>节点图标</DialogTitle>
        <p className="truncate text-xs text-muted-foreground" title={nodeText}>
          {nodeText}
        </p>
        <Input
          data-testid="icon-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 lucide 全集（名字或语义标签，如 flag / 时间）"
        />
        <ScrollArea className="h-72 rounded-md">
          <div data-testid="icon-grid" className="grid grid-cols-8 gap-1 p-1">
            {grid.map((g) => (
              <button
                key={g.name}
                type="button"
                data-testid={`icon-item-${g.name}`}
                title={g.name}
                aria-label={g.name}
                disabled={g.svg === null && !g.loading}
                onClick={() => toggle(g.name)}
                className={`flex aspect-square items-center justify-center rounded-md hover:bg-accent [&_svg]:size-5 ${
                  picked.includes(g.name) ? 'bg-secondary ring-2 ring-primary/60' : ''
                }`}
              >
                {g.svg === null ? (
                  <span className="text-xs text-muted-foreground">{g.loading ? '…' : '×'}</span>
                ) : (
                  // raw svg 来自 lucide-static 包内静态文件（非用户输入），注入渲染
                  <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: g.svg }} />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="icon-cancel" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" data-testid="icon-save" onClick={() => onConfirm(picked, extras)}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
