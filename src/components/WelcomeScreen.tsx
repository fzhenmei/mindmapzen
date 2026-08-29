interface Props {
  /** 创建工作区入口（主按钮）与「选择已有文件夹」（次链接）语义同一：
   *  都弹目录选择框——「创建工作区」即「选一个文件夹作为工作区」（现 pickDirectory 流） */
  onCreateWorkspace(): void
}

/** 首次开屏页（M5d spec §2）：无工作区时的居中品牌引导，替代旧 hint 文案。
 *  印章 logo 复用空态朱砂方印几何（48px 原尺寸），页首栏在此态隐藏（由 LibraryView 控制） */
export default function WelcomeScreen({ onCreateWorkspace }: Readonly<Props>) {
  return (
    <div className="welcome-screen" data-testid="welcome-screen">
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
      <h1 className="welcome-title">Mind Map Zen</h1>
      <p className="welcome-sub">想法落成 .md</p>
      <div className="welcome-actions">
        <button type="button" data-testid="btn-welcome-create" className="btn-primary" onClick={onCreateWorkspace}>
          创建工作区
        </button>
        <button type="button" data-testid="btn-welcome-pick" className="welcome-pick" onClick={onCreateWorkspace}>
          选择已有文件夹
        </button>
      </div>
    </div>
  )
}
