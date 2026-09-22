// src/components/NodeSearchDialog.tsx —— 节点搜索浮层（2026-09）：Ctrl+F / 砚栏搜索钮
// 呼出，QuickSwitchDialog（Ctrl+P 搜文件）同款骨架——屏幕上部窄高浮层、输入即过滤、
// ↑↓/Tab 循环高亮、Enter 跳转、Esc 由 radix 统一收口。差异两点：
// ① 跳转后浮层**保持**（连续 Enter 跳下一处，Esc 才关）——搜索是反复找的流；
// ② 候选是节点（含收起隐藏子树，全树快照在打开时拍于 useNodeSearch），命中跳转走
//   locate（展开收起祖先 + 居中 + 激活高亮，与看板回导图定位同源）。
// 纯展示组件——数据面在 services/nodeSearch，定位链在 useNodeSearch。
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { filterNodeHits, type NodeHit } from '../services/nodeSearch'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

/** 空 query 展示上限：全量节点可至数百，列表滚动区渲染全部会卡——前 50 够扫；
 *  有关键词时全量过滤（过滤结果天然小） */
const TOP_N = 50

interface Props {
  /** 打开时拍的全树候选（useNodeSearch flattenNodeHits 快照） */
  hits: ReadonlyArray<NodeHit>
  /** 跳转定位（展开收起祖先 + 居中 + 激活高亮，EditorView.locateNode 组合） */
  onPick(uid: string): void
  onClose(): void
}

export default function NodeSearchDialog({ hits, onPick, onClose }: Readonly<Props>) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const q = query.trim()
  // 可见列表：空 query 前 TOP_N；有关键词全量过滤。过滤词变化时 active 回首位（下方 onChange）
  const visible = q === '' ? hits.slice(0, TOP_N) : filterNodeHits(hits, q)
  const idx = Math.min(active, Math.max(visible.length - 1, 0))

  /** 键盘流（QuickSwitch 同款）：↑↓/Tab（Shift 反向）循环移动、Enter 跳转——浮层保持。
   *  Tab 亦拦下（焦点交进列表项会与高亮分离，v2.5 用户反馈同款）；Esc 不在此处 */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
      e.preventDefault()
      if (visible.length === 0) return
      const reverse = e.key === 'ArrowUp' || e.shiftKey
      setActive((idx + (reverse ? -1 : 1) + visible.length) % visible.length)
      return
    }
    if (e.key === 'Enter') {
      const hit = visible[idx]
      if (hit !== undefined) onPick(hit.uid)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">{t('editor.nodeSearch.title')}</DialogTitle>
        <Input
          data-testid="node-search-input"
          placeholder={t('editor.nodeSearch.placeholder')}
          value={query}
          autoFocus
          className="h-11 rounded-none border-0 border-b bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
        />
        {visible.length === 0 ? (
          <div data-testid="node-search-empty" className="p-6 text-center text-sm text-muted-foreground">
            {t('editor.nodeSearch.empty')}
          </div>
        ) : (
          <div data-testid="node-search-list" className="max-h-80 overflow-y-auto p-1" role="listbox">
            {visible.map((h, i) => (
              // tabIndex=-1：焦点恒留输入框，键盘导航只动高亮（QuickSwitch FocusScope 同款裁定）
              <button
                key={h.uid}
                type="button"
                role="option"
                tabIndex={-1}
                data-testid="node-search-item"
                aria-selected={i === idx}
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:ring-1 aria-selected:ring-ring"
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(h.uid)}
              >
                <span className="w-full truncate text-sm">{h.text}</span>
                {h.path !== '' && (
                  <span className="w-full truncate text-[11px] text-muted-foreground">{h.path}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* 匹配计数：仅有关键词时显示（空 query 的截断数会误导） */}
        {q !== '' && (
          <div data-testid="node-search-count" className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            {t('editor.nodeSearch.count', { count: visible.length })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
