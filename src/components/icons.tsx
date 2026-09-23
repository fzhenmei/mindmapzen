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
/** 节点标签（feature/node-tags）：斜置标签牌 + 穿绳孔，同 16 网格线性风格 */
export const IconTag = ({ size }: IconProps) =>
  base(
    <>
      <path d="M9.5 2H4a2 2 0 0 0-2 2v5.5a2 2 0 0 0 .59 1.41l4.5 4.5a2 2 0 0 0 2.82 0l5.5-5.5a2 2 0 0 0 0-2.82l-4.5-4.5A2 2 0 0 0 9.5 2Z" />
      <circle cx="5.5" cy="5.5" r="0.75" />
    </>,
    size,
  )
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
/** 下拉箭头（2026-09 复制选项下拉）：复制钮旁的展开指示，收窄网格 chevron */
export const IconChevronDown = ({ size }: IconProps) => base(<path d="M4 6l4 4 4-4" />, size)
/** 搜索节点（2026-09 节点搜索）：放大镜，lens 圆心 (6.5,6.5) r4.5 + 右下柄，16 网格 */
export const IconSearch = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="6.5" cy="6.5" r="4.5" />
      <path d="M10 10l4 4" />
    </>,
    size,
  )
/** 展开层级（一键收起到 N 级）：三层叠片（顶菱 + 双下缘折线），层叠即「层级」语义，
 *  自 lucide layers 简化，几何落在 16 网格（菱心 (8,4.5) 宽 12 高 6） */
export const IconLayers = ({ size }: IconProps) =>
  base(
    <>
      <path d="M8 1.5 14 4.5 8 7.5 2 4.5Z" />
      <path d="M2 8l6 3 6-3" />
      <path d="M2 11.5l6 3 6-3" />
    </>,
    size,
  )
/** 五角星（2026-09 收藏置顶）：正五角星外接 R6.4/内接 r2.9，圆心 (8,8) 网格点位几何核算 */
export const IconStar = ({ size }: IconProps) => base(
  <path d="M8 1.6L9.7 5.65L14.09 6.02L10.76 8.9L11.76 13.18L8 10.9L4.24 13.18L5.24 8.9L1.91 6.02L6.3 5.65Z" />,
  size,
)
/** 排序（2026-09 列表排序）：左升右降双箭头并列，16 网格 */
export const IconSort = ({ size }: IconProps) => base(
  <>
    <path d="M5.5 13V3" />
    <path d="M2.5 6l3-3 3 3" />
    <path d="M10.5 3v10" />
    <path d="M7.5 10l3 3 3-3" />
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
/** 时间轴布局（2026-09 更多布局）：根在左，节点沿主轴向右排开、二级挂下方
 *  （同族语言：r1.2 节点圆，线段止于圆缘不穿越） */
export const IconLayoutTimeline = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="2.8" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="11.8" cy="8" r="1.2" />
      <path d="M4.1 8h1.5M8.3 8h2.1M7 9.3v1.2" />
      <circle cx="7" cy="11.8" r="1.2" />
    </>,
    size,
  )
/** 鱼骨图布局（2026-09 更多布局）：根（鱼头）在左，脊线向右，两对鱼刺上下斜叉 */
export const IconLayoutFishbone = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="2.5" cy="8" r="1.2" />
      <path d="M3.8 8h9.7" />
      <path d="M6.2 8l1.8-3.3M6.2 8l1.8 3.3M9.6 8l1.8-3.3M9.6 8l1.8 3.3" />
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
/** Markdown 文档（2026-09 树文件行/欢迎页最近列表）：无框大「M↓」（Markdown 标志
 *  性语汇，VSCode Seti / Obsidian 的 md 文件图标同形）——16px 下框内 M↓ 三元素过密，
 *  去框放大到全网格保辨识；M 与箭头底部基线对齐 */
export const IconMarkdown = ({ size }: IconProps) =>
  base(
    <>
      <path d="M1.5 12V4l2.25 2.75L7 4v8" />
      <path d="M12 4v8M10 9.5l2 2 2-2" />
    </>,
    size,
  )
/** 新建导图（2026-09 画布砚栏）：文档轮廓 + 中央加号——画布内 IconPlus 已被「放大」
 *  占用，借文档形区分（案头无放大钮，新建仍用 IconPlus）；通用文档形（树行文件
 *  已换 IconMarkdown 的 M↓ 标志，此处的语义是「新建」而非「md 文档」） */
export const IconFilePlus = ({ size }: IconProps) =>
  base(
    <>
      <path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" />
      <path d="M9 1.5V5h3.5" />
      <path d="M8 6.5v4M6 8.5h4" />
    </>,
    size,
  )
/** 更多操作（容器合并改版，案头详情态窄容器收纳）：横排三点省略号——dots 沿
 *  IconTheme 前图标（音量/加载类）r=1.2 描边圆点口径 */
export const IconMore = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="13" cy="8" r="1.2" />
    </>,
    size,
  )
/** 设置（M5d 案头工具栏；2026-09 换真齿轮）：双圆（外齿圈 + 中心轴孔）+ 12 根齿线，
 *  24→16 缩放（÷1.5）自 lucide cog——旧版「中心圆+八向辐条」画出来是太阳/亮度图标 */
export const IconSettings = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="5.33" />
      <circle cx="8" cy="8" r="1.33" />
      <path d="M7.33 6.85 4.67 2.23M7.33 9.15 4.67 13.77M8 14.67v-1.33M8 1.33v1.33M9.33 8h5.33M1.33 8h1.33M11.33 13.77l-.66-1.15M11.33 2.23l-.66 1.15M13.77 11.33l-1.15-.66M13.77 4.67l-1.15.66M2.23 11.33l1.15-.66M2.23 4.67l1.15.66" />
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
/** 复制文件路径（2026-09 砚栏）：S 形路径双端弯钩（lucide route，24→16 ÷1.5
 *  缩放，x/y 范围恰居中网格）——与 IconCopy（双叠方框）形状区分，同 currentColor */
export const IconRoute = ({ size }: IconProps) =>
  base(<path d="M6 12.67h5.67a2.33 2.33 0 0 0 0-4.67h-7.33a2.33 2.33 0 0 1 0-4.67H10" />, size)
/** 重做（v1.1）：IconUndo 的镜像（右向回头箭头 + 下方半圆钩） */
export const IconRedo = ({ size }: IconProps) =>
  base(
    <>
      <path d="M12.5 7.5h-7a3.5 3.5 0 1 0 0 7H8" />
      <path d="M10 4.5l3 3-3 3" />
    </>,
    size,
  )
/** 大纲（2026-09 预览大纲面板）：三行条目线 + 左缘层级点（dot 用 h.01 短线口径） */
export const IconOutline = ({ size }: IconProps) =>
  base(
    <>
      <path d="M5.5 3.5H13M5.5 8H13M5.5 12.5H13" />
      <path d="M3 3.5h.01M3 8h.01M3 12.5h.01" />
    </>,
    size,
  )
/** 节点正文（2026-09 正文面板）：文档轮廓 + 三行正文线，24→16 缩放（÷1.5）自
 *  lucide file-text 图形（zen_body 角标已退役 2026-09-06，画布角标由引擎 note 通道承担） */
export const IconFileText = ({ size }: IconProps) =>
  base(
    <>
      <path d="M10 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V4.5z" />
      <path d="M9.5 1.5v2.5a1 1 0 0 0 1 1H13" />
      <path d="M6.7 6H5.3M10.7 8.7H5.3M10.7 11.3H5.3" />
    </>,
    size,
  )
/** 导图视图（2026-09 看板模式 · 砚栏视图组）：中枢辐网——中心节点四向连接角点
 *  （lucide network 语义缩至 16 网格；同族语言 r1.2 节点圆，辐线止于圆缘不穿越） */
export const IconNetwork = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="2.8" cy="3" r="1.2" />
      <circle cx="13.2" cy="3" r="1.2" />
      <circle cx="2.8" cy="13" r="1.2" />
      <circle cx="13.2" cy="13" r="1.2" />
      <path d="M7.01 7.01 3.65 3.85M8.99 7.01l3.36-3.16M7.01 8.99L3.65 12.15M8.99 8.99l3.36 3.16" />
    </>,
    size,
  )
/** 任务状态（2026-09 看板模式 · 浮条状态钮）：圆环 + 中心实点（lucide circle-dot 语义，
 *  外环同 IconSmile r6.2 口径，中心点 r1.2 实心同 IconMore 点径） */
export const IconCircleDot = ({ size }: IconProps) =>
  base(
    <>
      <circle cx="8" cy="8" r="6.2" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </>,
    size,
  )
/** 看板视图（2026-09 看板模式 · 砚栏视图组）：板框 + 两竖列（第二列短——列内卡片
 *  参差），24→16 缩放（÷1.5）自 lucide square-kanban 图形 */
export const IconKanbanSquare = ({ size }: IconProps) =>
  base(
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M5.33 4.67v6.66M8 4.67v3.93" />
    </>,
    size,
  )
/** 公众号（2026-09 Markdown 态「复制为公众号格式」砚栏钮）：微信标识性双对话
 *  气泡——大小相叠（小者右下在前）、各含双眼点、左下小尾巴。按本库线性风格自绘
 *  的简化轮廓（非官方品牌资产）：交叠区大气泡弧段留隙断开（遮挡读法），尾巴并入
 *  弧线避免根部尖角；眼睛点用零长线段 + 圆帽（IconOutline 同款） */
export const IconWechat = ({ size }: IconProps) =>
  base(
    <>
      <path d="M6.77 10.37A4.5 4.3 0 0 1 3.41 9.39L2.6 11.2 5.14 10.26A4.5 4.3 0 1 1 10.79 6.25" />
      <path d="M4.7 5.7h.01M7.9 5.7h.01" />
      <path d="M7.88 11.8A3.6 3.2 0 1 1 9.48 13.1L8.3 14.1Z" />
      <path d="M9.85 9.8h.01M12.15 9.8h.01" />
    </>,
    size,
  )
/** 归档（2026-09 看板治理 · 归档列收起条/批量归档钮）：纸盒——顶盖横条 + 箱体 +
 *  正面锁扣线（lucide archive 语义缩至 16 网格） */
export const IconArchive = ({ size }: IconProps) =>
  base(
    <>
      <rect x="2" y="2.5" width="12" height="3" rx="1" />
      <path d="M3.5 5.5v7A1.5 1.5 0 0 0 5 14h6a1.5 1.5 0 0 0 1.5-1.5v-7" />
      <path d="M6.7 9h2.6" />
    </>,
    size,
  )
/** 右向箭头（2026-09 看板治理 · 归档列收起钮）：IconChevronDown 的右向镜像
 *  （收起 = 向板缘收纳） */
export const IconChevronRight = ({ size }: IconProps) => base(<path d="M6 4l4 4-4 4" />, size)
/** 导出（2026-09 导出入口换语义图标）：上出托盘——IconImport 镜像成对（箭头出托盘） */
export const IconExport = ({ size }: IconProps) =>
  base(
    <>
      <path d="M8 2v7.5" />
      <path d="M5 5 8 2l3 3" />
      <path d="M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </>,
    size,
  )
/** 矢量图（2026-09 导出对话框 · SVG 入口）：S 曲线 + 双端节点圆（矢量路径语义，
 *  同族语言：曲线止于圆缘不穿越） */
export const IconVector = ({ size }: IconProps) =>
  base(
    <>
      <path d="M4.8 12.5C8.8 12.5 7.7 3.5 11.2 3.5" />
      <circle cx="3.5" cy="12.5" r="1.3" />
      <circle cx="12.5" cy="3.5" r="1.3" />
    </>,
    size,
  )
/** Word 文档（2026-09 导出对话框 · Word 入口）：文档轮廓复用 IconFileText 的两段
 *  路径 + 内部 W 字 */
export const IconFileWord = ({ size }: IconProps) =>
  base(
    <>
      <path d="M10 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V4.5z" />
      <path d="M9.5 1.5v2.5a1 1 0 0 0 1 1H13" />
      <path d="M5.2 6.2l.9 4L8 6.9l1.9 3.3.9-4" />
    </>,
    size,
  )
/** PDF 文档（2026-09 导出对话框 · PDF 入口）：同 IconFileWord 的文档轮廓 + 内部 P 字 */
export const IconFilePdf = ({ size }: IconProps) =>
  base(
    <>
      <path d="M10 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V4.5z" />
      <path d="M9.5 1.5v2.5a1 1 0 0 0 1 1H13" />
      <path d="M5.5 11V5.5h2.1a1.7 1.7 0 0 1 0 3.4H5.5" />
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
