// src/components/MapTabs.tsx —— 顶部导图胶囊条（2026-09 鼠标流切换）：最近打开的导图
// 平铺为常驻胶囊，当前图高亮，点选即走安全链切换，连点即翻（键盘流 Ctrl+Tab 不变）。
// 悬浮顶部居中停泊（同 ZenBar/zen-banner 悬浮模式：canvas-host 恒满屏，引擎零 resize 配合；
// 区别于设计稿「占位式」——占位需改 .editor/.canvas-host 核心布局，收益不敌风险，从简）。
// 纯展示组件：候选（mapTabs 派生，useQuickSwitch）与切换链（switchTo）全经 props。
import { useTranslation } from 'react-i18next'
import { basketAbsPath } from '../services/basket'
import { useAppStore } from '../store/appStore'
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
  const { t } = useTranslation()
  // 篮子徽章判据（Task 10）：绝对路径比对（同 EditorView isBasket 口径，同名不同目录不误标）。
  // 读 store 不加 props——候选是 mdPath 列表，徽章纯派生，调用方零接线；两字段均可为 null，
  // 判空在前。须在下方提前 return 之前调用（hooks 序恒定）
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const basketRelPath = useAppStore((s) => s.basketRelPath)
  const basketAbs = workspaceDir !== null && basketRelPath !== null ? basketAbsPath(workspaceDir, basketRelPath) : null
  if (tabs.length < 2) return null
  return (
    <nav
      data-testid="map-tabs"
      aria-label={t('settings.mapTabs.navLabel')}
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
              className="h-7 min-w-0 max-w-[10em] shrink rounded-full px-3 font-file text-xs aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
              onClick={() => {
                if (c.mdPath !== currentMdPath) onPick(c.mdPath)
              }}
            >
              {/* truncate 挂 span 不挂 Button：基类 inline-flex，text-overflow 对 flex 容器
                  无效（硬裁无省略号、文字贴边）；span 为 flex item，min-w-0 破除内容宽下限 */}
              <span className="min-w-0 truncate">{c.name}</span>
              {/* 篮子徽章（Task 10）：◱ 贴名末、shrink-0 不挤压截断名、aria-hidden 纯装饰 */}
              {c.mdPath === basketAbs && (
                <span data-testid="basket-badge" aria-hidden className="ml-1 shrink-0 text-[10px] opacity-70">
                  ◱
                </span>
              )}
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
