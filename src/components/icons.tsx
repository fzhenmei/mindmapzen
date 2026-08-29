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
/** 目录（M5a 案头移动导图用）：经典双栏文件夹轮廓 */
export const IconFolder = ({ size }: IconProps) =>
  base(
    <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h3l1.5 2H12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5z" />,
    size,
  )
