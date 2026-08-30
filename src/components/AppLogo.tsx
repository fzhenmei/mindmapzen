// 应用图标组件：与窗口标题栏/任务栏图标（src-tauri/icons，母版 design/icon-master.svg）同源。
// 路径逐字取自母版；颜色走令牌（朱砂印底 var(--destructive) + 印面白 var(--destructive-foreground)），
// 暗色主题下随令牌翻转。宪法第 1 条的"组件唯一来源"在 SVG 层的对应物：本组件是 UI 内 logo 的唯一来源。

interface Props {
  /** 像素尺寸（正方形）；默认 48（开屏/空态用 16 进制尺寸时传 16） */
  size?: number
  className?: string
}

export default function AppLogo({ size = 48, className }: Readonly<Props>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
    >
      {/* 朱砂方印底（rx 6，四边留 2px 呼吸位） */}
      <rect x="2" y="2" width="44" height="44" rx="6" fill="var(--destructive)" />
      {/* 三条放射枝：印面色细线自根圆心出发，端点落在子圆边缘 */}
      <g stroke="var(--destructive-foreground)" strokeWidth="2" strokeLinecap="round">
        <line x1="24" y1="24" x2="12.7" y2="14.3" />
        <line x1="24" y1="24" x2="35.3" y2="14.3" />
        <line x1="24" y1="24" x2="24" y2="34" />
      </g>
      {/* 根节点：实心圆（印面中心） */}
      <circle cx="24" cy="24" r="4.5" fill="var(--destructive-foreground)" />
      {/* 子节点：空心圆（露出朱砂底，三向分形） */}
      <g fill="none" stroke="var(--destructive-foreground)" strokeWidth="2">
        <circle cx="10" cy="12" r="3.5" />
        <circle cx="38" cy="12" r="3.5" />
        <circle cx="24" cy="37.5" r="3.5" />
      </g>
    </svg>
  )
}
