import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeIgnoredType } from '../services/ignoredType'
import type { IgnoredBlock } from '../types/tree'

/** 忽略块横幅（spec §3.5）：文档内未映射为节点的段落/代码块在打开时告知用户。
 *  默认收起，点「查看详情」展开明细；保存时这些内容将被丢弃（显式保存另有确认）。
 *  明细行 describeIgnoredType 的词典化在 Task 10（ignoredType 服务改造）。 */
export default function IgnoredBlocksBanner({ blocks }: Readonly<{ blocks: IgnoredBlock[] }>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="zen-banner" data-testid="ignored-banner">
      <span>{t('editor.ignored.banner', { count: blocks.length })}</span>
      <button type="button" data-testid="ignored-toggle" onClick={() => setOpen(!open)}>
        {open ? t('editor.ignored.collapse') : t('editor.ignored.details')}
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
