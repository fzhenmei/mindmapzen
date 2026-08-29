interface Props {
  /** 创建工作区入口（主按钮）与「选择已有文件夹」（次链接）语义同一：
   *  都弹目录选择框——「创建工作区」即「选一个文件夹作为工作区」（现 pickDirectory 流） */
  onCreateWorkspace(): void
}

/** 首次开屏页（M5d spec §2 → M12b 青松极简）：无工作区时的居中品牌引导，替代旧 hint 文案。
 *  印 icon 48px（朱砂方印）+ 名称 + 主钮；命令栏在此态隐藏（由 LibraryView 控制） */
export default function WelcomeScreen({ onCreateWorkspace }: Readonly<Props>) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2.5 text-muted-foreground"
      data-testid="welcome-screen"
    >
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="8" y="8" width="32" height="32" rx="4" fill="var(--color-brand)" />
        <path
          d="M17 25l5 5 10-12"
          stroke="var(--color-background)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="text-xl font-semibold tracking-wider text-foreground">Mind Map Zen</h1>
      <p className="text-sm">想法落成 .md</p>
      <div className="mt-3.5 flex flex-col items-center gap-2.5">
        <button
          type="button"
          data-testid="btn-welcome-create"
          className="inline-flex h-9 cursor-pointer items-center justify-center rounded-control bg-primary px-6 text-sm font-medium text-primary-soft transition-colors duration-150 hover:bg-primary-hover"
          onClick={onCreateWorkspace}
        >
          创建工作区
        </button>
        <button
          type="button"
          data-testid="btn-welcome-pick"
          className="cursor-pointer bg-transparent p-0.5 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-primary"
          onClick={onCreateWorkspace}
        >
          选择已有文件夹
        </button>
      </div>
    </div>
  )
}
