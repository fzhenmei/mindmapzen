// src/components/DevBadge.tsx —— 开发版贴纸（2026-09 版本信息批）：
// import.meta.env.DEV 驱动——tauri dev（vite dev server）为 true 显示，
// tauri build 出的 release 包为 false 不渲染，无需人工开关。
// 位置：视口右下角、编辑器主题钮（bottom-3 right-4，顶到 ~48px）上方错开；
// 朱砂虚线框 = 未定稿语义（呼应印记朱砂），45° 斜置贴纸姿态；pointer-events-none 纯标记不挡交互。
// z-40：浮于画布/砚栏（z-10）之上、对话框（z-50）之下。
export default function DevBadge() {
  if (!import.meta.env.DEV) return null
  return (
    <div
      data-testid="dev-badge"
      aria-hidden="true"
      className="pointer-events-none fixed bottom-14 right-3 z-40 rotate-45 rounded-md border border-dashed border-destructive/70 bg-destructive/10 px-2 py-0.5 font-mono text-[11px] tracking-widest text-destructive shadow-sm"
    >
      开发版 DEV
    </div>
  )
}
