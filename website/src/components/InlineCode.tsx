import type * as React from 'react'

/** 文件声道内联标记:快捷键、文件名、语法记号等"来自文件世界的词"统一用
 *  等宽字体呈现,与软件内「UI 声道 / 文件声道」的二元概念一致。 */
export function Code({ children }: { readonly children: React.ReactNode }) {
  return (
    <code className="rounded border bg-muted px-1 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  )
}
