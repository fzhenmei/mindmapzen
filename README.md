# mind-map-zen

本地优先的免费思维导图桌面应用：用熟悉的导图画布整理想法，每张导图就是一个 Markdown 文件，与 AI 交流零摩擦。

- Tauri 2 + React 19 + [simple-mind-map](https://github.com/wanglin2/mind-map) 引擎
- 每张导图 = 一个 `.md` 文件（唯一事实源）+ 一个 `.zen.json` 布局元数据文件
- 当前能力（v0.3.0）：画布编辑 + `.md`/`.zen.json` 持久化 + 文件库管理；复制 md（整图/子树）、导入 `.md`、多行粘贴拆子节点、布局切换、关闭守卫已交付；XMind 导入、PNG/SVG 导出开发中（M5）

## 当前限制

- 打开外部 `.md` 时，无法映射为节点的段落/代码块等内容在保存时会被丢弃（M4/M5 将加提示）

设计文档见 [docs/superpowers/specs/](docs/superpowers/specs/)。
