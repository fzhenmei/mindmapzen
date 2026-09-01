import type { ReactNode } from 'react'

/** 线性图标库（M4 禅意视觉）：16×16 viewBox，默认渲染 16px，随文字色（currentColor）、纯装饰 aria-hidden */
interface IconProps {
  size?: number
}

const base = (d: ReactNode, size = 16) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
)

export const IconArrowLeft = ({ size }: IconProps) => base(<path d="M10 3 5 8l5 5" />, size)
/** 切换导图（v2.5 快速切换）：左右双向箭头上下错行（⇄），行高对齐 16 网格 */
export const IconSwitch = ({ size }: IconProps) =>
  base(
    <>
      <path d="M13 4.5H3" />
      <path d="M6 1.5l-3 3 3 3" />
      <path d="M3 11.5h10" />
      <path d="M10 8.5l3 3-3 3" />
    </>,
    size,
  )
/** 保存（经典软盘，验收修复 2）：外轮廓（右上斜切+圆角）+ 底部门 + 顶部标签槽，
 *  24→16 缩放（÷1.5）自 lucide save，几何已核（圆角圆心均落在角内 3.3/11.7 网格上） */
export const IconSave = ({ size }: IconProps) =>
  base(
    <>
      <path d="M12.7 14H3.3A2.3 2.3 0 0 1 1 11.7V3.3A2.3 2.3 0 0 1 3.3 1h7L15 5.6v6.1a2.3 2.3 0 0 1-2.3 2.3z" />
      <path d="M11.3 14V8.7H4.7V14" />
      <path d="M4.7 2v3.3h5.3" />
    </>,
    size,
  )
export const IconCopy = ({ size }: IconProps) =>
  base(
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M3.5 10.5v-7a1 1 0 0 1 1-1h7" />
    </>,
    size,
  )
/** 粘贴（剪贴板+内容条）：外框圆角矩形 + 顶部夹片 + 两条内容线 */
export const IconPaste = ({ size }: IconProps) =>
  base(
    <>
      <rect x="3" y="4.5" width="10" height="10" rx="1.5" />
      <path d="M6 4.5V3.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M6 9h4M6 12h2" />
    </>,
    size,
  )
export const IconMinus = ({ size }: IconProps) => base(<path d="M4 8h8" />, size)
export const IconPlus = ({ size }: IconProps) => base(<path d="M8 4v8M4 8h8" />, size)
export const IconCrosshair = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14" />
    </>,
    size,
  )
export const IconFrame = ({ size }: IconProps) =>
  base(
    <path d="M3 6V4.5A1.5 1.5 0 0 1 4.5 3H6M10 3h1.5A1.5 1.5 0 0 1 13 4.5V6M13 10v1.5a1.5 1.5 0 0 1-1.5 1.5H10M6 13H4.5A1.5 1.5 0 0 1 3 11.5V10" />,
    size,
  )
export const IconLayoutRight = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="3.5" cy="8" r="1.2" />
      <path d="M5 8h4M9 8l3-3M9 8l3 3" />
      <circle cx="12.5" cy="4.5" r="1.2" />
      <circle cx="12.5" cy="11.5" r="1.2" />
    </>,
    size,
  )
export const IconLayoutBoth = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="1.2" />
      <path d="M6.5 8H3M9.5 8H13" />
      <circle cx="2.8" cy="8" r="1.2" />
      <circle cx="13.2" cy="8" r="1.2" />
    </>,
    size,
  )
export const IconLayoutDown = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="3.5" r="1.2" />
      <path d="M8 5v3M4 8h8M4 8v2.5M12 8v2.5" />
      <circle cx="4" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
    </>,
    size,
  )
export const IconTheme = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 3a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" />
    </>,
    size,
  )
export const IconPencil = ({ size }: IconProps) =>
  base(<path d="M11.5 3.5l1 1L6 11l-1.8.8L5 10l6.5-6.5z" />, size)
export const IconTrash = ({ size }: IconProps) =>
  base(<path d="M3.5 5h9M6.5 5V3.5h3V5M5 5l.6 8h4.8L11 5M7 7.5v3M9 7.5v3" />, size)
/** 节点备注（M5b）：便签纸轮廓 + 右上折角 + 一行字线 */
export const IconNote = ({ size }: IconProps) =>
  base(
    <>
      <path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v5L9 13.5H4A1.5 1.5 0 0 1 2.5 12z" />
      <path d="M9 13.5V10a1 1 0 0 1 1-1h3.5" />
      <path d="M5.5 6h5" />
    </>,
    size,
  )
/** 节点图标入口（M18）：笑脸（圆脸 + 双点 + 弧口） */
export const IconSmile = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.6 9.2c.5 1 1.3 1.6 2.4 1.6s1.9-.6 2.4-1.6" />
      <path d="M5.8 6.2h.01M10.2 6.2h.01" />
    </>,
    size,
  )
/** 目录（M5a 案头移动导图用）：经典双栏文件夹轮廓 */
export const IconFolder = ({ size }: IconProps) =>
  base(
    <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h3l1.5 2H12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5z" />,
    size,
  )
/** 打开/外开（M15 案头文件详情）：方框角 + 右上外开斜箭头 */
export const IconOpen = ({ size }: IconProps) =>
  base(
    <>
      <path d="M6 3H4A1.5 1.5 0 0 0 2.5 4.5v7A1.5 1.5 0 0 0 4 13h7a1.5 1.5 0 0 0 1.5-1.5v-2" />
      <path d="M9 2.5h4.5V7" />
      <path d="M13.5 2.5 8 8" />
    </>,
    size,
  )
/** 导图文件（M5d 案头目录树文件行）：文档轮廓 + 右上折角 */
export const IconFile = ({ size }: IconProps) =>
  base(
    <>
      <path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
      <path d="M9 1.5V5h3.5" />
    </>,
    size,
  )
/** 设置（M5d 案头工具栏）：齿轮（中心圆 + 八向辐条） */
export const IconSettings = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" />
    </>,
    size,
  )
/** 导入 .md（v0.7.0 验收纯图标化）：下装入托盘——箭头向下入 + 底部托盘轮廓 */
export const IconImport = ({ size }: IconProps) =>
  base(
    <>
      <path d="M8 2v7M5 6.5 8 9.5l3-3" />
      <path d="M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </>,
    size,
  )
/** 导出图片（M5b）：相框轮廓 + 山形折线 + 日点 */
export const IconImage = ({ size }: IconProps) =>
  base(
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M4.5 11l2.5-3 2 2.2 1.5-1.7L13 11.5" />
      <circle cx="5.8" cy="5.8" r="0.9" fill="currentColor" stroke="none" />
    </>,
    size,
  )
/** 节点连线（验收轮）：双环链扣（斜向断链表示可连接），缩自 lucide link-2 */
export const IconLink = ({ size }: IconProps) =>
  base(
    <>
      <path d="M6.5 9.5l3-3" />
      <path d="M5 11l-1.5 1.5a2.1 2.1 0 0 1-3-3L3 7" />
      <path d="M11 5l1.5-1.5a2.1 2.1 0 0 1 3 3L13 9" />
    </>,
    size,
  )
/** 撤销（v1.1）：左向回头箭头 + 下方半圆钩（lucide undo-2 缩至 16 网格） */
export const IconUndo = ({ size }: IconProps) =>
  base(
    <>
      <path d="M3.5 7.5h7a3.5 3.5 0 1 1 0 7H8" />
      <path d="M6 4.5 3 7.5l3 3" />
    </>,
    size,
  )
/** 重做（v1.1）：IconUndo 的镜像（右向回头箭头 + 下方半圆钩） */
export const IconRedo = ({ size }: IconProps) =>
  base(
    <>
      <path d="M12.5 7.5h-7a3.5 3.5 0 1 0 0 7H8" />
      <path d="M10 4.5l3 3-3 3" />
    </>,
    size,
  )

/* ═══ 窗口三键（v2.5 自定义标题栏）：Win11 caption 按钮规格的极简线稿，几何居中于 16 网格 ═══ */
/** 最小化：底对齐短横（Win11 惯例，非垂直居中） */
export const IconWinMin = ({ size }: IconProps) => base(<path d="M3.5 11.5h9" />, size)
/** 最大化：细边方框 */
export const IconWinMax = ({ size }: IconProps) => base(<rect x="3.5" y="3.5" width="9" height="9" />, size)
/** 还原：错位双叠框（前小后大，Win11 语义） */
export const IconWinRestore = ({ size }: IconProps) =>
  base(
    <>
      <path d="M5.5 5.5h7v7h-7z" />
      <path d="M11 3.5H3.5V11" />
    </>,
    size,
  )
/** 关闭：X */
export const IconWinClose = ({ size }: IconProps) => base(<path d="M4 4l8 8M12 4l-8 8" />, size)
