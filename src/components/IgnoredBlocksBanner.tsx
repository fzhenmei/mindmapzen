import { useState } from 'react'
import { describeIgnoredType } from '../services/ignoredType'
import type { IgnoredBlock } from '../types/tree'

/** 忽略块横幅（spec §3.5）：文档内未映射为节点的段落/代码块在打开时告知用户。
 *  默认收起，点「查看详情」展开明细；保存时这些内容将被丢弃（显式保存另有确认）。 */
export default function IgnoredBlocksBanner({ blocks }: Readonly<{ blocks: IgnoredBlock[] }>) {
  const [open, setOpen] = useState(false)
  return (
    <div className="zen-banner" data-testid="ignored-banner">
      <span>{blocks.length} 个内容块未映射（保存时将丢弃）</span>
      <button type="button" data-testid="ignored-toggle" onClick={() => setOpen(!open)}>
        {open ? '收起' : '查看详情'}
      </button>
      {open && (
        <ul data-testid="ignored-list">
          {blocks.map((b) => (
            <li key={b.type + b.excerpt}>
              {describeIgnoredType(b.type)}：{b.excerpt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
