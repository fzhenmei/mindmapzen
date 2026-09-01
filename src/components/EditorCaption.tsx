// src/components/EditorCaption.tsx —— 题签与主题钮容器（M5a 拆分自 EditorView；M12b Task 4 青松换肤）：
// 左下题签 = 等宽文件声道导图名 + 有未保存修改时缀朱砂脏印（spec §3 纸面）+
// 基本信息统计（2026-09：节点数 + 最后保存时间，并入题签行不加新浮层）+
// 复制文件路径小钮（2026-09：路径发给 AI 直接读本文件；写剪贴板与「已复制」印记
// 由 EditorView 组合，本组件纯展示）；右下 theme-fab 仅是定位容器，按钮本体为
// ThemeToggle（内部接 store，不经 props）。
// editor-caption/caption-name/theme-fab 类名保留为视觉冒烟钩子（skin 已转 utility，App.css 无对应规则）。
import ThemeToggle from './ThemeToggle'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconCopy } from './icons'

interface Props {
  /** 导图名（EditorView 取自 mdPath 文件名，去 .md 扩展） */
  name: string
  /** 有未保存修改（true 时缀朱砂脏印） */
  dirty: boolean
  /** 导图文件绝对路径（复制钮 tooltip 预览；复制执行在 EditorView） */
  mdPath: string
  /** 复制文件路径（EditorView 组合 writeClipboard + 「已复制」印记） */
  onCopyPath(): void
  /** 节点总数（EditorView 自引擎树计数，data_change 时刷新） */
  nodeCount: number
  /** 最后一次成功落盘时刻（ms）；null = 打开以来未保存过 */
  savedAt: number | null
}

/** 保存时间人性化（本地钟，同 WelcomePane.friendlyTime 先例的组件内局部函数）：
 *  null=未保存；今天只显 HH:mm；更早补日期前缀 MM-DD */
function savedTimeLabel(ms: number | null): string {
  if (ms === null) return '未保存'
  const d = new Date(ms)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return hm
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`
}

/** 左下等宽题签 + 朱砂脏印 + 统计行 + 复制路径钮；右下主题钮容器（testid/类名钩子不变，皮肤转 utility） */
export default function EditorCaption({ name, dirty, mdPath, onCopyPath, nodeCount, savedAt }: Readonly<Props>) {
  return (
    <>
      <div className="editor-caption pointer-events-none absolute bottom-3 left-4 z-[5] flex items-center gap-2 text-sm text-muted-foreground">
        <span className="caption-name max-w-[40vw] truncate font-mono">{name}</span>
        {dirty && (
          /* aria-live：朱砂点出现/消失时向读屏播报（色点本身无文本，aria-label 提供语义） */
          <span role="status" aria-live="polite">
            <span
              data-testid="dirty-badge"
              title="有未保存修改"
              aria-label="有未保存修改"
              className="inline-block size-2 rounded-[2px] bg-destructive"
            />
          </span>
        )}
        {/* 统计行（2026-09）：节点数 + 最后保存时间，muted 小字不抢题签 */}
        <span data-testid="caption-stats" className="whitespace-nowrap font-mono text-xs">
          {nodeCount} 节点 · {savedTimeLabel(savedAt)}
        </span>
        {/* 复制路径钮：容器 pointer-events-none，钮体自恢复交互；tooltip 预览完整路径 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="pointer-events-auto"
              data-testid="btn-copy-path"
              aria-label="复制文件路径"
              onClick={onCopyPath}
            >
              <IconCopy size={12} />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-96">
            <span className="block truncate">复制文件路径：{mdPath}</span>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="theme-fab absolute bottom-3 right-4 z-[5]">
        <ThemeToggle />
      </div>
    </>
  )
}
