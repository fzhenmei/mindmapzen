// src/components/DevBadge.tsx —— 开发版贴纸（2026-09 版本信息批）：
// import.meta.env.DEV 驱动——tauri dev（vite dev server）为 true 显示，
// tauri build 出的 release 包为 false 不渲染，无需人工开关。
// 位置：右下角菱形角贴——正方形逆时针转 45°（原左下/右下角分别指向正下/正右），
// 再 translate(-20.71%)（=(√2-1)/2）把两角分别顶到视口下边/右边；与右下角主题钮叠压。
// 朱砂虚线框 = 未定稿语义（呼应印记朱砂），pointer-events-none 纯标记不挡交互。
// z-40：浮于画布/砚栏（z-10）之上、对话框（z-50）之下。
export default function DevBadge() {
  if (!import.meta.env.DEV) return null
  return (
    <div
      data-testid="dev-badge"
      aria-hidden="true"
      className="pointer-events-none fixed bottom-0 right-0 z-40 flex h-14 w-14 -translate-x-[20.71%] -translate-y-[20.71%] -rotate-45 flex-col items-center justify-center rounded-md border border-dashed border-destructive/70 bg-destructive/10 font-mono text-[11px] leading-tight tracking-widest text-destructive shadow-sm"
    >
      <span>DEV</span>
      <span>开发版</span>
    </div>
  )
}
