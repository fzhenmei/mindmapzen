// src/components/EditorCaption.tsx —— 题签与主题钮容器（M5a 拆分自 EditorView，零行为变化）：
// 左下题签显示导图名、有未保存修改时缀朱砂点（dirty-badge）；
// 右下 theme-fab 仅是定位容器，按钮本体为 ThemeToggle（内部接 store，不经 props）。
import ThemeToggle from './ThemeToggle'

interface Props {
  /** 导图名（EditorView 取自 mdPath 文件名，去 .md 扩展） */
  name: string
  /** 有未保存修改（true 时缀 dirty-badge 朱砂点） */
  dirty: boolean
}

/** 左下题签 + 朱砂脏印；右下主题钮容器（JSX 自 EditorView 原样迁移，testid/类名不变） */
export default function EditorCaption({ name, dirty }: Readonly<Props>) {
  return (
    <>
      <div className="editor-caption">
        <span className="caption-name">{name}</span>
        {dirty && (
          /* aria-live：朱砂点出现/消失时向读屏播报（色点本身无文本，aria-label 提供语义） */
          <span role="status" aria-live="polite">
            <span
              data-testid="dirty-badge"
              className="seal-dot"
              title="有未保存修改"
              aria-label="有未保存修改"
            />
          </span>
        )}
      </div>
      <div className="theme-fab">
        <ThemeToggle />
      </div>
    </>
  )
}
