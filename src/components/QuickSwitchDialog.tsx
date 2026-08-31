import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

/** 切换候选（EditorView 派生）：mdPath 定位文件，name/dir 仅展示 */
export interface SwitchCandidate {
  mdPath: string
  /** 显示名（不含 .md 扩展） */
  name: string
  /** 相对工作区目录（'' = 根），参与过滤与次行展示 */
  dir: string
}

interface Props {
  candidates: ReadonlyArray<SwitchCandidate>
  onPick(mdPath: string): void
  onClose(): void
  /** 轮换模式（Ctrl+Tab 按住轮换，v2.5）：隐藏输入框、高亮受控于此（Tab 轮换在
   *  useQuickSwitch 的全局监听）；undefined = 搜索模式（Ctrl+P），高亮内部自管 */
  cycleActive?: number
  /** 轮换模式高亮变化上报（hover 条目同步外部状态） */
  onActiveChange?(index: number): void
}

/** 匹配口径（v2.5 快速切换）：dir/name 拼合串大小写不敏感子串——输图名或目录名都能命中 */
const matches = (c: SwitchCandidate, q: string): boolean =>
  `${c.dir}/${c.name}`.toLowerCase().includes(q.toLowerCase())

/** 默认展示上限（v2.5）：无输入只显前 N（候选已按可达性排好序——最近打开置顶 +
 *  修改时间降序），输入关键词后全量过滤；轮换模式不截断（Tab 循环可达全列表） */
const TOP_N = 10

/** 快速切换浮层（v2.5 编辑器内切换导图）：Ctrl+P 搜索 / Ctrl+Tab 轮换两形态共用——
 *  轮换态传 cycleActive（无输入框、高亮受控），搜索态不传（输入过滤、↑↓/Enter 内部自管）。
 *  纯展示组件——候选与切换链在 EditorView 装配。布局 VS Code Quick Open 手法：
 *  屏幕上部窄高浮层（覆写 dialog 默认居中），无 ✕ 钮；Esc 由 radix 统一收口 onClose */
export default function QuickSwitchDialog({ candidates, onPick, onClose, cycleActive, onActiveChange }: Readonly<Props>) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const cycling = cycleActive !== undefined
  const q = query.trim()
  // 可见列表：轮换态全量（Tab 循环可达全列表）；搜索态无输入显前 TOP_N、有输入全量过滤
  const visibleOf = (): ReadonlyArray<SwitchCandidate> => {
    if (cycling) return candidates
    if (q === '') return candidates.slice(0, TOP_N)
    return candidates.filter((c) => matches(c, q))
  }
  const visible = visibleOf()
  // 受控/自管高亮统一收口：越界收拢到列表范围内（过滤词变化/候选缩短时防悬空）
  const raw = cycling ? cycleActive : active
  const idx = Math.min(raw, Math.max(visible.length - 1, 0))

  /** 键盘流（搜索态输入框承载）：↑↓/Tab（Shift 反向）循环移动、Enter 挑选。Tab 亦拦下
   *  （v2.5 用户反馈）——不拦会把焦点交进列表项，focus ring 滞留旧项与高亮分离。
   *  Esc 不在此处——radix Dialog 在 document 捕获阶段统一处理（onOpenChange(false)
   *  → onClose），自持分支会双触发 */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
      e.preventDefault()
      if (visible.length === 0) return
      const reverse = e.key === 'ArrowUp' || e.shiftKey
      setActive((idx + (reverse ? -1 : 1) + visible.length) % visible.length)
      return
    }
    if (e.key === 'Enter') {
      if (visible[idx] !== undefined) onPick(visible[idx].mdPath)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">切换导图</DialogTitle>
        {!cycling && (
          <Input
            data-testid="switch-input"
            placeholder="输入图名或目录，回车切换…"
            value={query}
            autoFocus
            className="h-11 rounded-none border-0 border-b bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0) // 新过滤词：高亮回首位
            }}
            onKeyDown={onKey}
          />
        )}
        {visible.length === 0 ? (
          <div data-testid="switch-empty" className="p-6 text-center text-sm text-muted-foreground">
            没有匹配的导图
          </div>
        ) : (
          <div data-testid="switch-list" className="max-h-80 overflow-y-auto p-1" role="listbox">
            {visible.map((c, i) => (
              // tabIndex=-1（v2.5 用户反馈「框滞留」根因）：radix Dialog 的 FocusScope
              // 焦点陷阱在捕获层接管 Tab 并把焦点交给列表项（preventDefault 拦不住），
              // focus ring 便滞留旧项与高亮分离——条目退出 Tab 序，焦点恒留输入框，
              // 键盘导航（Tab/↑↓）只动高亮；鼠标点击不受 tabIndex 影响
              <button
                key={c.mdPath}
                type="button"
                role="option"
                tabIndex={-1}
                data-testid="switch-item"
                aria-selected={i === idx}
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:ring-1 aria-selected:ring-ring"
                onMouseEnter={() => (cycling ? onActiveChange?.(i) : setActive(i))}
                onClick={() => onPick(c.mdPath)}
              >
                <span className="truncate font-file text-sm">{c.name}</span>
                <span className="truncate font-file text-[11px] text-muted-foreground">
                  {c.dir === '' ? '（工作区根目录）' : c.dir}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
