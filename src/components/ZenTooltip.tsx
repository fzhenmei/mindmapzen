import { Tooltip } from 'radix-ui'
import type { ReactNode } from 'react'

interface ZenTooltipProps {
  /** 浮签文案（视觉提示）；语义名由触发元素自身的 aria-label 承担，二者职责分离 */
  label: string
  /** 触发元素（asChild 透传，按钮 testid/aria-label 原样保留） */
  children: ReactNode
}

/** 统一浮签（M5c）：Radix Tooltip 原语做交互底层（悬停/聚焦、延迟、Esc 收起白送），
 *  皮肤走 tokens（.zen-tooltip）。取代图标按钮的浏览器原生 title（无样式/不可控延迟/
 *  与本组件叠加双提示）。ZenDialog 同款约定：不自持开态，纯声明式包装。 */
export default function ZenTooltip({ label, children }: Readonly<ZenTooltipProps>) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content data-testid="zen-tooltip" className="zen-tooltip" sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
