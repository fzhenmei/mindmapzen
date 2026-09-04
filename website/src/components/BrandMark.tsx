import { cn } from '../lib/utils'

/** 朱砂方印节点记号——同应用图标(src-tauri/icons):朱砂圆角方底,
 *  中心实心圆向三个方向伸出连线,末端空心环。官网唯一允许朱砂大面积出现的地方。 */
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="12" fill="var(--destructive)" />
      <g stroke="var(--destructive-foreground)" strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M32 32 L32 16" />
        <path d="M32 32 L17 44" />
        <path d="M32 32 L47 44" />
      </g>
      <circle cx="32" cy="32" r="5" fill="var(--destructive-foreground)" />
      <circle cx="32" cy="16" r="3.5" fill="var(--destructive)" stroke="var(--destructive-foreground)" strokeWidth="3.5" />
      <circle cx="17" cy="44" r="3.5" fill="var(--destructive)" stroke="var(--destructive-foreground)" strokeWidth="3.5" />
      <circle cx="47" cy="44" r="3.5" fill="var(--destructive)" stroke="var(--destructive-foreground)" strokeWidth="3.5" />
    </svg>
  )
}
