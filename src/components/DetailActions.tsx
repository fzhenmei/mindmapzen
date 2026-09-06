import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { MapInfo } from '../types/files'
import { formatFileSize } from '../services/fileSize'
import { i18n } from '../i18n'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { iconBtn } from './ui/icon-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  IconArrowLeft,
  IconCopy,
  IconFolder,
  IconMore,
  IconOpen,
  IconPencil,
  IconStar,
  IconTrash,
} from './icons'

/** 详情态对话框流操作三态（LibraryView 统一管理对话框；FileExplorer 退役后类型迁此） */
export type MapAction = 'move' | 'rename' | 'delete'

interface Props {
  /** 当前选中的导图（动作寻址数据源） */
  info: MapInfo
  /** 收藏态（2026-09 收藏置顶）：星标钮切换文案与 aria 之据 */
  favorite: boolean
  /** 星标切换（收藏/取消收藏）：LibraryView 反查 mdPath 后走 store（含持久化） */
  onToggleFavorite(): void
  /** 关闭预览（清文件选中回落欢迎页） */
  onBack(): void
  /** 对话框流操作（移动/重命名/删除），对话框在 LibraryView 统一管理 */
  onAction(a: MapAction, m: MapInfo): void
  /** 复制文件路径（写剪贴板端口经 LibraryView 注入） */
  onCopyPath(path: string): void
  /** 打开导图进纸面 */
  onOpen(m: MapInfo): void
}

/** 详情态页首标题（容器合并：原卡头 CardTitle 上移，truncate 截断加 …） */
export const detailTitle = (m: Readonly<MapInfo>): string => `${m.name}.md`

/** 标题 tooltip 的元信息行（容器合并：原卡脚下沉信息并入悬停）——大小 · 创建 · 修改。
 *  日期 locale 随界面语言（i18n.language 调用时取值，无模块顶层求值问题） */
const dt = (ms: number) => new Date(ms).toLocaleString(i18n.language)
export const detailMeta = (m: Readonly<MapInfo>): string =>
  i18n.t('library.fileDetail.meta', { size: formatFileSize(m.size), created: dt(m.createdAt), modified: dt(m.modifiedAt) })

/** 案头详情动作组（容器合并改版）：自 FileDetail 卡头上移至主容器页首，置于常驻钮
 *  左侧。三组沿卡头节奏（[返回] | [移动/重命名/删除] | [复制路径/打开]，组间竖线）；
 *  同一份数据喂两处渲染——宽容器整组平铺（Tooltip 纯图标）、窄容器「更多」下拉
 *  （icon + 文字，浮层平铺）。宽窄由页首 @container 容器查询纯 CSS 分流（680px 阈值，
 *  零 JS 测量）。条目 testid 加 more- 前缀（与宽组同名钮区分，E2E 严格模式不撞名） */
export default function DetailActions({ info, favorite, onToggleFavorite, onBack, onAction, onCopyPath, onOpen }: Readonly<Props>) {
  const { t } = useTranslation()
  const groups = [
    [{ testid: 'btn-detail-back', label: t('library.fileDetail.closePreview'), Icon: IconArrowLeft, run: onBack }],
    // 星标切换（2026-09 收藏置顶）：选中预览时顺手点星；文案随收藏态切换
    [{ testid: 'btn-detail-favorite', label: favorite ? t('library.unfavorite') : t('library.favorite'), Icon: IconStar, run: onToggleFavorite }],
    (
      [
        ['btn-move', t('library.moveToDir'), IconFolder, 'move'],
        ['btn-rename', t('common.rename'), IconPencil, 'rename'],
        ['btn-delete', t('common.delete'), IconTrash, 'delete'],
      ] as const
    ).map(([testid, label, Icon, a]) => ({
      testid,
      label,
      Icon,
      run: () => onAction(a, info),
    })),
    [
      {
        testid: 'btn-copy-path',
        label: t('library.fileDetail.copyPath'),
        Icon: IconCopy,
        run: () => onCopyPath(info.mdPath),
      },
      { testid: 'btn-detail-open', label: t('library.fileDetail.openMap'), Icon: IconOpen, run: () => onOpen(info) },
    ],
  ]
  return (
    <>
      {/* 宽容器：整组平铺（页首容器 ≥ 680px；低于即换「更多」） */}
      <div className="hidden items-center gap-1 @[680px]:flex">
        {groups.map((group, gi) => (
          <Fragment key={group[0].testid}>
            {gi > 0 && <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />}
            {group.map(({ testid, label, Icon, run }) => (
              <Fragment key={testid}>{iconBtn(label, testid, Icon, run)}</Fragment>
            ))}
          </Fragment>
        ))}
      </div>
      {/* 窄容器：⋯ 收纳全部详情动作 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="btn-detail-more"
            aria-label={t('library.fileDetail.moreActions')}
            className="@[680px]:hidden"
          >
            <IconMore />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {groups.flat().map(({ testid, label, Icon, run }) => (
            <DropdownMenuItem key={testid} data-testid={`more-${testid}`} onClick={run}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* 详情组与页首常驻组分隔 */}
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
    </>
  )
}
