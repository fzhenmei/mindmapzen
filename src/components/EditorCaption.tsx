// src/components/EditorCaption.tsx —— 题签与主题钮容器（M5a 拆分自 EditorView；M12b Task 4 青松换肤）：
// 左下题签 = 等宽文件声道导图名 + 有未保存修改时缀朱砂脏印（spec §3 纸面）；
// 右下 theme-fab 仅是定位容器，按钮本体为 ThemeToggle（内部接 store，不经 props）。
// editor-caption/caption-name/theme-fab 类名保留为视觉冒烟钩子（skin 已转 utility，App.css 无对应规则）。
import ThemeToggle from './ThemeToggle'

interface Props {
  /** 导图名（EditorView 取自 mdPath 文件名，去 .md 扩展） */
  name: string
  /** 有未保存修改（true 时缀朱砂脏印） */
  dirty: boolean
}

/** 左下等宽题签 + 朱砂脏印；右下主题钮容器（testid/类名钩子不变，皮肤转 utility） */
export default function EditorCaption({ name, dirty }: Readonly<Props>) {
  return (
    <>
      <div className="editor-caption pointer-events-none absolute bottom-3 left-4 z-[5] flex items-center gap-2 text-sm text-muted-foreground">
        <span className="caption-name max-w-[40vw] truncate font-mono">{name}</span>
        {dirty && (
          /* aria-live：朱砂点出现/消失时向读屏播报（色点本身无文本，aria-label 提供语义） */
          <span role="status" aria-live="polite">
            <span
              data-testid="dirty-badge"
              title="有未保存修改"
              aria-label="有未保存修改"
              className="inline-block size-2 rounded-[2px] bg-brand"
            />
          </span>
        )}
      </div>
      <div className="theme-fab absolute bottom-3 right-4 z-[5]">
        <ThemeToggle />
      </div>
    </>
  )
}
