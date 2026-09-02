# mind-map-zen

本地优先的免费思维导图桌面应用：用熟悉的导图画布整理想法，每张导图就是一个 Markdown 文件，与 AI 交流零摩擦。

- Tauri 2 + React 19 + [simple-mind-map](https://github.com/wanglin2/mind-map) 引擎
- 每张导图 = 一个 `.md` 文件（唯一事实源）+ 一个 `.zen.json` 布局元数据文件
- 砚与纸双主题：跟随系统或手动切换，界面与画布同步
- 当前能力（v1.0.0）：首次开屏引导、案头三区（图标工具栏/文件级目录树/大纲预览，单击选中双击打开）、连线净化（画布隐藏 `[[ ]]` 标记、md 句尾规范化）、连线弯曲记忆（拖弯 sidecar 持久恢复）、案头目录组织（左树导航/按层过滤/移动导图/新建目录）、画布编辑/复制 md（整图/子树）/导入/多行粘贴/布局切换（导图/逻辑/组织三种）/关闭守卫/纸墨·夜墨双主题、节点备注（引用块）、`[[名称]]` 双链连线、设置页（复制含备注/保留双链/更换工作区/退出工作区）；布局与主题偏好自动记忆、PNG/SVG 导出与复制为图片、图标按钮浮签提示、朱砂方印应用图标；列表页称「案头」、画布编辑称「纸面」

## 当前限制

- 打开外部 `.md` 时，无法映射为节点的段落/代码块等内容在保存时会被丢弃（打开有横幅提示，显式保存前确认）

## 开发指南

```bash
npm run dev        # 前端开发服务器（Vite）
npm run dev:app    # 桌面壳完整开发模式（Tauri 窗口；单实例锁与 release 分离，可与 release 并行，见下方说明）
npm run tauri dev  # 桌面壳开发模式旧入口（单实例锁与 release 共享，二者不能并行）
npm test           # 单元/组件测试（Vitest）
npm run e2e        # 端到端测试（Playwright，web 模式）
npm run lint       # ESLint
npm run typecheck  # TypeScript 类型检查
npm run build      # 前端构建（tsc + vite）
npm run build:release  # release 打包（msi/nsis 安装包，见下方说明）
```

**release 打包**：`npm run build:release` 委托 `tauri build` 出包——产物在 `src-tauri/target/release/bundle/`（msi + nsis 双格式），免安装单文件 exe `mind-map-zen.exe` 在 `src-tauri/target/release/`（裸 exe 名取自 `src-tauri/Cargo.toml` 的包名，与 `tauri.conf.json` 的 `productName` 无关——后者只管 bundle 安装包）。脚本（`scripts/build-release.mjs`）会自动定位 Windows SDK 的 `rc.exe` 并前置进 PATH：改过 `src-tauri/tauri.conf.json` 或 `capabilities/*` 后 `tauri-winres` 重编译需要它，而普通终端 PATH 里没有（有编译缓存时不触发，一触发即报 RC.EXE panic）。参数原样透传，如 `npm run build:release -- --no-bundle` 只出 exe 不打安装包。

**单实例锁与 dev/release 并行**：应用用 `tauri-plugin-single-instance` 防多开——同 identifier 二次启动不起新进程，转而聚焦已有主窗口。锁 key 取自 `tauri.conf.json` 的 identifier（Windows 为 named mutex，如 release 的 `com.mindmapzen.app-sim`），dev 与 release 默认共享一把锁。并行调试请用 `npm run dev:app`：它以 `--config` 把 identifier 覆盖为 `com.mindmapzen.app.dev`，锁随之分离——dev 与 release 可并行，同类型（dev↔dev、release↔release）仍互斥。注意事项：WebView2 本地数据目录（localStorage 等）跟随 identifier，首次用 `dev:app` 会重新开始一次，换来 dev 与 release 数据彻底隔离（开发试验不污染真实数据）；`npm run tauri dev` 仍是共享锁的旧入口，与已运行的 release 互斥；release 构建不受影响。

设计文档见 [docs/superpowers/specs/](docs/superpowers/specs/)。
