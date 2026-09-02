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

/** 非精选 svg 累积缓存（模块级：svg 内容不可变，跨搜索词/对话框开合复用）。
 *  2026-09 修复：extras 此前只从当前搜索结果取——跨搜索词多选时，先前选中的非精选
 *  图标丢失运行时注册，保存后当场就渲染空占位（重开恢复由 MindMapCanvas 打开期补注册兜底） */
const uncuratedSvgCache = new Map<string, string>()

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
      // Vite 的 JSON 动态导入返回 { default: 对象 } 命名空间（验收实案：直接当对象用
      // 则 Object.keys 只得 ['default']，搜索恒空）——解包 default 再用
      const mod = (await import('lucide-static/tags.json')) as unknown as {
        default: Record<string, string[]>
      }
      const tags = mod.default
      if (cancelled) return
      const q = query.trim().toLowerCase()
      // 名字含 q 或任一标签含 q；上限 24 个防网格爆炸；精选图标 svg 直取
      const names = Object.keys(tags)
        .filter((n) => n.includes(q) || tags[n]?.some((t) => t.toLowerCase().includes(q)))
        .slice(0, 24)
      setResults(
        names.map((name) => ({
          name,
          svg: CURATED_ICONS[name] ?? uncuratedSvgCache.get(name) ?? null,
          loading: CURATED_ICONS[name] === undefined && !uncuratedSvgCache.has(name),
        })),
      )
      // 非精选项逐个懒加载 svg（失败宽容置空并从可选中排除）；成功即入累积缓存
      for (const name of names) {
        if (CURATED_ICONS[name] !== undefined || uncuratedSvgCache.has(name)) continue
        const svg = await loadIconSvg(name)
        if (cancelled) return
        if (svg !== null) uncuratedSvgCache.set(name, svg)
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

  // 已选行 svg 补载（2026-09）：打开期恢复的非精选（未经搜索、不在本组件缓存）挂载后
  // 异步补图；入缓存后 bump 触发重渲染（cache 为模块级可变，渲染读它须手动驱动）
  const [, bumpChipTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const n of picked) {
        if (CURATED_ICONS[n] !== undefined || uncuratedSvgCache.has(n)) continue
        const svg = await loadIconSvg(n)
        if (cancelled) return
        if (svg !== null) {
          uncuratedSvgCache.set(n, svg)
          bumpChipTick((t) => t + 1)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [picked])

  // extras = 本次选中但不在精选集的（从累积缓存取，不依赖当前搜索结果——跨搜索词不丢）
  const extras = picked
    .filter((n) => CURATED_ICONS[n] === undefined)
    .map((n) => {
      const svg = uncuratedSvgCache.get(n)
      return svg === undefined ? undefined : { name: n, icon: svg }
    })
    .filter((r): r is { name: string; icon: string } => r !== undefined)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="icon-dialog" aria-label="节点图标" className="sm:max-w-2xl">
        <DialogTitle>节点图标</DialogTitle>
        <p className="truncate text-xs text-muted-foreground" title={nodeText}>
          {nodeText}
        </p>
        {/* 已选行（2026-09，用户反馈）：当前选中全量在场、点击即移除——非精选图标不在
            默认网格（精选 64），不搜索看不到已选，不知道关键词便无从删起；精选在 64 格
            里找选中环也费眼。chip = 图标 + 常显 ×（删除可供性初见即知，用户三审），
            悬停 title 显示名字；svg 异步补载（上方 effect），加载不出的非法名维持 '…' 占位
            （与宽容丢弃一致） */}
        {picked.length > 0 && (
          <div data-testid="icon-chips" className="flex flex-wrap gap-1">
            {picked.map((name) => {
              const svg = CURATED_ICONS[name] ?? uncuratedSvgCache.get(name)
              return (
                <button
                  key={name}
                  type="button"
                  data-testid={`icon-chip-${name}`}
                  title={`移除 ${name}`}
                  aria-label={`移除 ${name}`}
                  onClick={() => toggle(name)}
                  className="flex items-center gap-0.5 rounded-md bg-secondary px-1 py-0.5 hover:bg-accent [&_svg]:size-4"
                >
                  {svg !== undefined ? (
                    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
                  ) : (
                    <span aria-hidden="true" className="text-[10px] text-muted-foreground">…</span>
                  )}
                  <span aria-hidden="true" className="text-[10px] leading-none text-muted-foreground">×</span>
                </button>
              )
            })}
          </div>
        )}
        <Input
          data-testid="icon-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 lucide 全集（名字或语义标签，如 flag / 时间）"
        />
        <ScrollArea type="hover" className="h-72 rounded-md">
          {/* pr-3：给 Radix 覆盖式滚动条留位——否则最右列图标的选中环被滚动条遮挡（验收实案） */}
          <div data-testid="icon-grid" className="grid grid-cols-8 gap-1 p-1 pr-3">
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
