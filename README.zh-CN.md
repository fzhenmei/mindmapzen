# mind-map-zen

[English](README.md) | **简体中文**

本地优先的免费思维导图桌面应用：用熟悉的导图画布整理想法，每张导图就是一个 Markdown 文件，与 AI 交流零摩擦。

- Tauri 2 + React 19 + [simple-mind-map](https://github.com/wanglin2/mind-map) 引擎
- 每张导图 = 一个 `.md` 文件（唯一事实源）+ 一个 `.zen.json` 布局元数据文件
- 看板模式与 AI 对话内置于同一棵树
- 中英双语界面，砚与纸双主题（含夜墨）

## 功能总览（v2.18）

### 案头（导图库）

- 目录树导航、按层过滤、大纲预览（单击选中、双击打开）
- 新建、重命名、删除（进回收站）、移动导图、新建目录、左树右键菜单
- 导入 `.xmind` 与 `.md`（含忽略块预览确认）
- 「复制为公众号格式」：整篇 Markdown 一键转微信公众号富文本（代码块高亮内联、mermaid 图转图片）

### 纸面（画布编辑）

- 键盘流编辑：`Tab` 建子节点、`Enter` 建同级、拖拽调整层级与顺序、多行粘贴一行一节点
- 三种布局：导图、逻辑图、组织架构图；折叠展开、缩放平移
- `[[名称]]` 双链连线：画布隐藏标记只留连线，拖弯的曲线重开仍在
- 节点图标精选与状态徽章
- 节点正文：近全屏 vditor 分屏编辑，以 Markdown 引用块存盘，mermaid 悬停渲染
- 复制整图或子树为 Markdown；导出 PNG/SVG

### 看板模式

- 同一棵树，导图规划 + Markdown 阅读 + 看板执行：节点句尾 `@status` 标记（六态，含归档）
- 全功能看板：拖拽换列、内联编辑、列底新增、转回普通节点
- 子树整卡入板、hover 速览子孙、复制卡片粘贴给 AI
- 头部过滤（标题/路径/标签）、done 列批量归档；`Ctrl+1/2/3` 直达导图 / Markdown / 看板三态

### AI 对话

- 应用内 AI 面板：对话即改图，七个结构化导图工具（增删改、移动、同级排序）
- 每张导图就是 `.md` 文件——让 AI 直接改文件、重开导图即是最新，或用内置面板驱动画布
- 回合分轮徽章；git 备份未启用时首轮自动插入安全网告知

### 本地与数据

- 工作区自动 git 备份：版本历史对话框，随时回滚——回滚本身也能再回滚
- 首次启动 11 步漫游引导
- 免费、本地优先、离线可用、无账号

## 下载与安全提示

- 安装包从 [GitHub Releases](https://github.com/fzhenmei/mindmapzen/releases) 获取：MSI / NSIS 安装包 + 便携版 zip
- 安装包未购买代码签名证书，浏览器或 SmartScreen 可能提示「未知发布者 / 不常见下载」——点「保留 / 仍要下载」与「更多信息 → 仍要运行」即可继续；也可用各 Release 说明中的 SHA-256 校验后再运行：`certutil -hashfile <文件名> SHA256`

## 当前限制

- 打开外部 `.md` 时，未映射为节点的段落/代码块等内容在保存时会被丢弃（打开时有横幅告知，显式保存前另有确认）
- 目前仅提供 Windows 安装包（msi/nsis/免安装 exe）

## 开发指南

### 环境要求

- **Node.js LTS（建议 ≥ 22，[nodejs.org](https://nodejs.org/) 下载）**：前端开发/构建/测试与所有 npm 脚本的运行时；Tauri CLI（`@tauri-apps/cli`）已列入 devDependencies，`npm install` 后即可用，无需全局安装
- **Rust stable 工具链**：仅编译桌面壳（`npm run dev:app`、`npm run build:release`）需要——用 [rustup](https://rustup.rs/) 安装 stable（Windows 目标 `x86_64-pc-windows-msvc`），`src-tauri/Cargo.toml` 钉的 `rust-version = "1.77.2"` 是下限；纯前端命令（`dev` / `test` / `e2e` / `lint` / `typecheck` / `build`）不装 Rust 也能跑
- **Visual Studio C++ 生成工具（MSVC + Windows 10/11 SDK）**：Rust msvc 目标链接与 `tauri-winres` 资源编译的前提（release 打包所需 `rc.exe` 即出自 Windows SDK，见下方说明）；建议先装它再装 Rust
- **WebView2 运行时**：Tauri 的界面载体，Windows 10/11 一般自带，无需单独安装

首次克隆后先 `npm install`；跑 e2e 前首次执行 `npx playwright install` 下载浏览器。Windows PowerShell 里若 `npm` 报「禁止运行脚本」，执行一次 `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` 放行 npm.ps1 即可。

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

**单实例锁与 dev/release 并行**：应用用 `tauri-plugin-single-instance` 防多开——同 identifier 二次启动不起新进程，转而聚焦已有主窗口。锁 key 取自 `tauri.conf.json` 的 identifier（Windows 为 named mutex，如 release 的 `com.mindmapzen.app-sim`），dev 与 release 默认共享一把锁。并行调试请用 `npm run dev:app`：它以 `--config src-tauri/tauri.dev.conf.json`（JSON Merge Patch，覆盖 identifier 为 `com.mindmapzen.app.dev`；用配置文件而非内联 JSON，避免 npm 的 cmd script-shell 剥引号）把锁分离——dev 与 release 可并行，同类型（dev↔dev、release↔release）仍互斥。注意事项：WebView2 本地数据目录（localStorage 等）跟随 identifier，首次用 `dev:app` 会重新开始一次，换来 dev 与 release 数据彻底隔离（开发试验不污染真实数据）；`npm run tauri dev` 仍是共享锁的旧入口，与已运行的 release 互斥；release 构建不受影响。

## 许可证

[MIT](LICENSE)
