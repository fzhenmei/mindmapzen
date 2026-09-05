// src/components/MapTabs.tsx —— 顶部导图胶囊条（2026-09 鼠标流切换）：最近打开的导图
// 平铺为常驻胶囊，当前图高亮，点选即走安全链切换，连点即翻（键盘流 Ctrl+Tab 不变）。
// 悬浮顶部居中停泊（同 ZenBar/zen-banner 悬浮模式：canvas-host 恒满屏，引擎零 resize 配合；
// 区别于设计稿「占位式」——占位需改 .editor/.canvas-host 核心布局，收益不敌风险，从简）。
// 纯展示组件：候选（mapTabs 派生，useQuickSwitch）与切换链（switchTo）全经 props。
import type { SwitchCandidate } from './QuickSwitchDialog'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface Props {
  /** 胶囊候选（mapTabs 稳定序，含当前图） */
  tabs: ReadonlyArray<SwitchCandidate>
  /** 当前图路径（高亮锚点；点击当前胶囊 no-op） */
  currentMdPath: string
  /** 点选切换（EditorView 接 quick.switchTo 安全链：保存成功才跳转） */
  onPick(mdPath: string): void
}

/** 顶部导图胶囊条：仅 1 张时不渲染（无切换意义，保持沉浸） */
export default function MapTabs({ tabs, currentMdPath, onPick }: Readonly<Props>) {
  if (tabs.length < 2) return null
  return (
    <nav
      data-testid="map-tabs"
      aria-label="最近打开的导图"
      className="absolute left-1/2 top-2 z-[5] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-hidden rounded-full bg-card px-1.5 py-1 shadow-md"
    >
      {tabs.map((c) => (
        <Tooltip key={c.mdPath}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="map-tab"
              aria-current={c.mdPath === currentMdPath ? 'page' : undefined}
              className="h-7 min-w-0 max-w-[10em] truncate rounded-full px-3 font-file text-xs aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              onClick={() => {
                if (c.mdPath !== currentMdPath) onPick(c.mdPath)
              }}
            >
              {c.name}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span className="font-file">{c.name}</span>
            {c.dir !== '' && <span className="text-muted-foreground"> · {c.dir}</span>}
          </TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
