# simple-mind-map 引擎 API 核验笔记（M1 spike，Task 5）

- 引擎包：`simple-mind-map@0.14.0-fix.3`（`node_modules/simple-mind-map`，下文路径均相对此目录）
- 核验方式：静态阅读安装包源码（替代无法自动化的 `npm run tauri dev` 手工 spike）；窗口级人工验证合并至 Task 9 后的统一手工检查点
- 结论：**MindMapCanvas 封装与 `src/types/simple-mind-map.d.ts` 的全部五项假设成立，未做任何调整**

## 逐项核验

### (a) 事件名 `data_change` 存在且在数据变更时触发 —— 成立

- `src/core/command/Command.js:55-71` `exec(name, ...args)`：执行命令后，除 `BACK/FORWARD/SET_NODE_ACTIVE/CLEAR_ACTIVE_NODE` 外一律调用 `this.addHistory()`
- `src/core/command/Command.js:106-133` `addHistory()`：数据与上一次不同才入历史，随后 `this.mindMap.emit('data_change', data)`（第 127 行）
- 回退/前进路径：`src/core/render/Render.js:743-753` `backForward()` 末尾同样 `emit('data_change', data)`（第 752 行）
- 即：任何走 `execCommand` 的数据变更（含插入/删除/编辑文本）与撤销重做，都会触发 `data_change`。回调带一个 data 参数（我们未使用，无碍）
- 相关：更细粒度还有 `data_change_detail`（`Command.js:202-203`），M1 不用

### (b) 命令 `INSERT_CHILD_NODE` / `INSERT_NODE` / `REMOVE_NODE` 为合法 execCommand 名 —— 成立

- 注册处 `src/core/render/Render.js`：
  - 第 254 行 `command.add('INSERT_NODE', this.insertNode)`（插入同级）
  - 第 260 行 `command.add('INSERT_CHILD_NODE', this.insertChildNode)`（插入子级）
  - 第 288 行 `command.add('REMOVE_NODE', this.removeNode)`（删除节点）
- 入口 `index.js:451-453` `execCommand(...args) → this.command.exec(...)`，未注册名静默不执行（`Command.js:56` `if (this.commands[name])`）
- 注意：引擎内置删除快捷键是 `Del|Backspace`（`Render.js:407-408`），我们自定义映射只取 `Delete`，不冲突

### (c) `getData()` 返回含 `data.expand` 的完整树 —— 成立

- `index.js:500-514`：默认 `getData()` 返回 `simpleDeepClone(this.command.getCopyData())`（完整节点树）；仅当传 `withConfig=true` 才返回 `{layout, root, theme, view}` 包装结构
- `src/core/command/Command.js:177-181` `getCopyData()`：复制 `renderer.renderTree`
- `src/utils/index.js:162-181` `copyRenderTree()`：`tree.data = simpleDeepClone(root.data)`——data 内字段全量深拷贝，`expand` 原样保留；且 `expand` 在非样式字段白名单 `nodeDataNoStylePropList` 中（`src/constants/constant.js:185`），不会被当作样式剥离
- 细节 1：复制会强制 `isActive=false`（`utils/index.js:164-170`）——无碍，我们只读 text/expand/children
- 细节 2：返回的根对象额外带 `smmVersion` 字段（`Command.js:180`）——`engineTreeToZen` 只读 `data.text/expand` 与 `children`，多余字段自动忽略，无碍

### (d) `destroy()` 存在 —— 成立

- `index.js:757-783`：隐藏/移除文本编辑框 → 逐插件 `beforePluginDestroy` → `this.event.unbind()` 解绑事件 → `this.svg.remove()` → 清容器类名/内容/CSS → 置 `this.el = null`。卸载清理完整

### (e) 构造函数接受 `{ el, data }` —— 成立

- `index.js:33` `class MindMap`；`index.js:39` `constructor(opt = {})` 与 `defaultOpt` 深合并（默认项见 `src/constants/defaultOptions.js:7` `el: null`、`:9` `data: null`）
- `index.js:41-48`：`this.opt.data = this.handleData(this.opt.data)` 后 `this.el = this.opt.el`，缺 el 抛 `'缺少容器元素el'`
- `index.js:181-191` `handleData()`：深拷贝入参树 → **强制根节点 `data.expand = true`（根不可收起，与我们转换器语义一致：折叠集永远不会包含根）** → 为无 uid 节点生成 uid。我们传入的 `{ data: { text, expand }, children }` 形状被原样接受
- `on/off`：`index.js:345-346` / `355-356`（委托内部 EventEmitter）；`setData(data)`：`index.js:466-474`——d.ts 声明全部属实

## 导出形态与插件（假设外补充核验）

- 默认导出是 class 本身：`index.js:849` `export default MindMap`，非工厂函数，`new MindMap({...})` 用法正确
- 核心能力（增删节点、文本编辑、缩放平移、撤销重做）全部在 `src/core` 内建，**无需任何 `MindMap.usePlugin`**；插件（`index.js:822` 起 `MindMap.usePlugin`）只用于导出/框选/拖拽/富文本等增强功能。M1 不加载插件

## 键盘处理：引擎内置快捷键与我们容器 onKeyDown 的关系（重要）

引擎自身在 window 上挂了全局 keydown（`src/core/command/KeyCommand.js:88`），且内置注册了 `Tab→INSERT_CHILD_NODE`（`src/core/render/Render.js:384-385`）、`Insert`、`Enter→INSERT_NODE`（392-393）、`Del|Backspace→REMOVE_NODE`（407-408）等快捷键。其触发门槛 `defaultEnableCheck`（`KeyCommand.js:101-110`）：`e.target === document.body`，或 target 的 class 在 `editNodeClassList`（`index.js:84`，初始为空）中。

由此推出的行为矩阵（M1 无插件，已确认无双重触发）：

| 按键时 focus 目标 | 我们的容器 onKeyDown | 引擎 window 快捷键 | 结果 |
|---|---|---|---|
| document.body（常态，画布内 SVG 不可聚焦） | 不触发（React 合成事件仅限容器子树内） | 触发 | 单次插入/删除 |
| 容器内某可聚焦元素（如未来工具栏按钮） | 触发（tagName 非 TEXTAREA/INPUT） | 不触发（过不了 defaultEnableCheck） | 单次插入/删除 |
| 引擎文本编辑器（编辑中） | 不触发（见下） | 编辑态由 `registerTmpShortcut` 接管 Enter/Tab 为关闭编辑框（`TextEdit.js:182-189`） | 正常编辑 |

「引擎文本编辑器打开时不拦截」的实际保障（比简报的 tagName 判断更根本）：

1. 引擎默认编辑器是 **contenteditable div 而非 textarea/input**（`src/core/render/TextEdit.js:314` `createElement('div')`、`:331` `contenteditable=true`），但默认挂载到 **document.body 而非容器内**（`TextEdit.js:360-362` `customInnerElsAppendTo || document.body`）——位于我们容器子树之外，React onKeyDown 根本收不到这些按键
2. 编辑器自身对 keydown/keyup/click/mousedown 做了 `stopPropagation`（`TextEdit.js:334-349`）
3. `handleEngineKeyDown` 的 TEXTAREA/INPUT 守卫因此是纵深防御（例如未来若设置 `customInnerElsAppendTo` 指向容器），保留

残余风险（M1 范围外，记录备查）：若未来加载会把编辑 DOM class 注册进 `editNodeClassList` 的插件（如 RichText），且该 DOM 被移入我们容器，则同一按键可能同时命中两条路径（容器 onKeyDown + 引擎快捷键）。届时需在 `handleEngineKeyDown` 增加 contenteditable 祖先判断或用 `mm.getKeydownHandler` 统一收口。

## 给 Task 9 手工检查点的提示

- **滚轮缩放**：默认 `mousewheelAction: 'MOVE'`（`src/constants/defaultOptions.js:58`）——纯滚轮是平移，**Ctrl+滚轮才是缩放**（`:61-62` 注释）。手工清单里的「滚轮缩放」按 Ctrl+滚轮验证，或后续在构造选项里设 `mousewheelAction: 'zoom'`
- 中文渲染无特殊处理需求（引擎按 CSS 字体渲染，默认主题含中文字体栈；`defaultOptions.js` `emptyTextMeasureHeightText: 'abc123我和你'` 亦为中文度量设计）
- `getData()` 树根带 `smmVersion`、节点带引擎生成的 `uid`——落盘 sidecar 时由 `engineTreeToZen` 天然过滤，不会污染 md

## d.ts 充要性说明

安装包 `package.json` 的 `"types": "./types/index.d.ts"` 指向的 `types/` 目录**在发布包中不存在**，故 TypeScript 无包内类型可用；本项目 `src/types/simple-mind-map.d.ts` 的 ambient 模块声明是必需的，且与包内类型无合并冲突。
