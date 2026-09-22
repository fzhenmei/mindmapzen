// src/components/ExpandLevelMenu.tsx —— 展开层级单选下拉（一键收起到 N 级，2026-09）：
// 砚栏缩放段挂件，收起常驻钮位不占——「全部展开」+「展开到 1~5 级」六项；N 级 = 可见到
// 第 N 层分支（第 N 层节点收起态显示、更深层隐藏；根不计级——引擎 expand 控制子树，
// 根的子节点恒可见，「只显示根」不可达也无意）。执行体是引擎原生命令（EXPAND_ALL /
// UNEXPAND_TO_LEVEL，走命令通道自动获得置脏/保存链/undo/AI 回合锁），接线在 ZenBar
// props，本组件纯展示。
// 受控值 level 由 statusOps.expandLevelOf 从 renderTree 派生（'all' 全展开 / n 精确层级 /
// undefined 手动混合折叠）——undefined 时单选组无匹配项，六项全不亮（混合态不撒谎）。
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { IconLayers } from './icons'

/** 菜单固定档位：1~5 级（设计裁定：不随图深度动态扩展，更深用「全部展开」或手动收起） */
const LEVELS = [1, 2, 3, 4, 5] as const

interface Props {
  /** 当前展开层级（expandLevelOf 口径）；undefined = 混合态不高亮 */
  level: number | 'all' | undefined
  /** 点选执行：'all' → EXPAND_ALL；n → UNEXPAND_TO_LEVEL(n)（命令落地在 EditorView） */
  onSelect(v: number | 'all'): void
}

export default function ExpandLevelMenu({ level, onSelect }: Readonly<Props>) {
  const { t } = useTranslation()
  const label = t('editor.zenbar.expandLevel')
  // 受控换算：undefined → ''（RadioGroup 无匹配项全不亮，Radix 空串合法值）
  const value = level === 'all' || level === undefined ? (level ?? '') : String(level)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="btn-expand-level"
          aria-label={label}
          title={label}
        >
          <IconLayers />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onSelect(v === 'all' ? 'all' : Number(v))}
        >
          <DropdownMenuRadioItem value="all" data-testid="expand-level-all">
            {t('editor.zenbar.expandAll')}
          </DropdownMenuRadioItem>
          {LEVELS.map((n) => (
            <DropdownMenuRadioItem key={n} value={String(n)} data-testid={`expand-level-${n}`}>
              {t('editor.zenbar.expandToLevel', { n })}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
