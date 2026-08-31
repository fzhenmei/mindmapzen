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
}

/** 匹配口径（v2.5 快速切换）：dir/name 拼合串大小写不敏感子串——输图名或目录名都能命中 */
const matches = (c: SwitchCandidate, q: string): boolean =>
  `${c.dir}/${c.name}`.toLowerCase().includes(q.toLowerCase())

/** 快速切换浮层（v2.5 编辑器内切换导图）：Ctrl+P 呼出、Esc 关闭，输入即过滤、
 *  ↑↓ 循环高亮、Enter/点击切换。纯展示组件——候选与切换链在 EditorView 装配。
 *  布局 VS Code Quick Open 手法：屏幕上部窄高浮层（覆写 dialog 默认居中），无 ✕ 钮 */
export default function QuickSwitchDialog({ candidates, onPick, onClose }: Readonly<Props>) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const q = query.trim()
  const visible = q === '' ? candidates : candidates.filter((c) => matches(c, q))
  // 过滤词变化后旧索引越界：收拢到新列表范围内（重置回首项）
  const idx = Math.min(active, Math.max(visible.length - 1, 0))

  /** 键盘流（输入框承载）：↑↓ 循环移动、Enter 挑选。Esc 不在此处——radix Dialog 在
   *  document 捕获阶段统一处理（onOpenChange(false) → onClose），自持分支会双触发 */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (visible.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((idx + step + visible.length) % visible.length)
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
        {visible.length === 0 ? (
          <div data-testid="switch-empty" className="p-6 text-center text-sm text-muted-foreground">
            没有匹配的导图
          </div>
        ) : (
          <div data-testid="switch-list" className="max-h-80 overflow-y-auto p-1" role="listbox">
            {visible.map((c, i) => (
              <button
                key={c.mdPath}
                type="button"
                role="option"
                data-testid="switch-item"
                aria-selected={i === idx}
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left aria-selected:bg-accent"
                onMouseEnter={() => setActive(i)}
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
