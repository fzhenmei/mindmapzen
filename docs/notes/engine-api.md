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

## M3 核验（Task 3，选中态/粘贴/布局）

对 M3 五项假设逐条核验（路径相对 `node_modules/simple-mind-map`）。**结论先行：1/3/4/5 项假设需修正后采用，第 2 项不成立（不阻断）；`node_active_clear` 事件不存在、布局常量为小驼峰，是两处与本仓假设差异最大的点。**

### (1) 选中事件 `node_active` 存在；`node_active_clear` **不存在** —— 部分成立

- 唯一触发点：`src/core/render/Render.js:456-467` `emitNodeActiveEvent(node = null, activeNodeList = [...this.activeNodeList])`，第 465 行 `this.mindMap.emit('node_active', node, activeNodeList)`。注意两点：① 有 `setTimeout(..., 0)` 异步去抖（463-466）；② 先用 `checkNodeListIsEqual` 比对上次激活列表，无变化不触发（457-461）
- 负载形态：`(node, activeNodeList)`——第一参是「本次触发激活/取消的节点实例」，可为 `null`；第二参是当前全部激活节点的数组。节点点击路径见 `src/core/render/node/MindMapNode.js:383-391`（Ctrl 多选时 `emitNodeActiveEvent(isActive ? null : this)`）
- 取消选中：引擎**没有** `node_active_clear` 事件（全源码 grep 仅 `node_active` 一处 emit）。清空走命令 `CLEAR_ACTIVE_NODE`（`Render.js:309` 注册）→ `clearActiveNode()`（`Render.js:638-644`）→ `emitNodeActiveEvent(null, [])`，即**同样以 `node_active`（第一参为 null）对外通知**。画布空白处点击即此路径（`Render.js:150-152` `draw_click` → `clearActiveNodeListOnDrawClick` → `Render.js:488`）
- uid 提取路径：节点实例上 `this.uid = opt.uid`（`MindMapNode.js:26`），**引擎没有 `getUid()` 方法**（全源码 grep `getUid` 仅命中 utils 的 `_findParentUid`）。组件里 `node?.getUid ? node.getUid() : node?.uid` 的防御式写法仍可用（恒走 `.uid` 分支），语义等价于 `node?.uid`
- **接线结论**：只订阅 `node_active` 一个事件即可覆盖选中与取消两种情况（node 参数非空→uid，为 null→null）；`node_active_clear` 订阅移除
- 残余风险备忘：`Render.js` 多处直接调 `clearActiveNodeList()`（如 850/887/959 行插入/删除节点后）**不 emit**，激活列表会静默清空——组件侧 uid 可能变陈旧；M3 复制功能已有「uid 未命中→整树复制」兜底，可容忍

### (2) ESC 清空选中 —— **不成立（引擎无 ESC 处理）**

- 全源码 grep `Escape` 仅命中 `htmlEscape`（大小写敏感的键名匹配为零），`KeyCommand.js` 与 `Render.js` 的快捷键注册表（`Render.js:384-452`：Tab/Insert/Enter/Delete/方向键/Ctrl 系列）均无 Escape
- 取消选中的引擎内置途径只有画布空白点击/右键（`draw_click`/`contextmenu`）。按控制器约定：此项仅记录，不为 ESC 添加引擎外清空调用；`onActiveChange(null)` 只依赖 `node_active` 的 null 负载

### (3) `INSERT_CHILD_NODE` / `INSERT_NODE` 不接受裸文本参数 —— 假设修正

- `src/core/render/Render.js:786-791`：`insertNode(openEdit = true, appointNodes = [], appointData = null, appointChildren = [])`
- `Render.js:893-898`：`insertChildNode(openEdit = true, appointNodes = [], appointData = null, appointChildren = [])`
- 文本经由第三参 `appointData` 传入：构造新节点 data 时 `...(appointData || {})` 展开（`Render.js:837-842` / `945-950`），即 `execCommand('INSERT_CHILD_NODE', openEdit, appointNodes, { text: '...' })`（可带 `uid` 等字段一并覆盖）。两个命令在无激活节点且未指定 `appointNodes` 时静默返回（793-795 / 899-901）
- 批量插入另有 `insertMultiChildNode(appointNodes, childList)`（`Render.js:970` 起，childList 为 `[{ data: { text }, children }]` 数组）——Task 4 粘贴拆子节点可直接用它，一次命令完成整批

### (4) `SET_NODE_TEXT` 按节点实例传参 —— 成立

- 注册：`Render.js:326-327`；实现 `Render.js:1750-1757` `setNodeText(node, text, richText, resetRichText)`——第一参是**节点实例**而非 uid。持有 uid 的调用方需先经 `findSubtreeByUid`/渲染树定位节点（本项目 Task 2 已备 `findSubtreeByUid`，作用于 data 树；如需节点实例可再经 `mm.renderer.findNodeByUid` 类接口，M3 不使用）

### (5) 布局常量为小驼峰，简报三处猜测值**全部错误** —— 假设修正

- `src/constants/constant.js:9-24` `LAYOUT`：`LOGICAL_STRUCTURE: 'logicalStructure'`（:10）、`MIND_MAP: 'mindMap'`（:12）、`ORGANIZATION_STRUCTURE: 'organizationStructure'`（:13）。简报猜测的 `'logical_structure'` / `'mind_map'` / `'organization_chart'`（下划线风格）在引擎中均不存在
- 布局注册表 `Render.js:46-72` `layouts` 的键即上述常量字符串；构造 opt `layout` 默认值 `logicalStructure`（`src/constants/defaultOptions.js:15`），由 `Render.setLayout`（`Render.js:124-135`）消费：`layouts[layout] || this.mindMap[layout]`，未知名**静默回退** `logicalStructure`（130-133）——所以错误布局名不会报错、只会"看起来还是右向布局"，layoutMap 必须写死真实常量
- **`layoutMap.ts` 最终映射**（三值互异，非法值回退右向）：

  | LayoutKind | 含义 | 引擎布局名（实际） | 简报猜测（弃用） |
  |---|---|---|---|
  | `mindmap` | 右向思维导图 | `'logicalStructure'` | `'logical_structure'` |
  | `logic` | 左右逻辑图（根居中发散） | `'mindMap'` | `'mind_map'` |
  | `org` | 组织结构图（向下） | `'organizationStructure'` | `'organization_chart'` |

### d.ts 影响

本次接线仅新增 `on/off('node_active', ...)`（已有泛型 `on/off` 声明覆盖）与构造 opt `layout`（opts 已有索引签名 `[k: string]: unknown` 覆盖），`src/types/simple-mind-map.d.ts` 无需新增成员；仅把构造 opts 里 `layout` 提为显式键并保留索引签名，便于类型提示。

## M3 核验补（Task 4，多行粘贴执行的节点实例定位）

### (6) `mindMap.renderer.findNodeByUid(uid)` **存在** —— 成立

- 实现 `Render.js:2093-2115`：`this.root` 为空时返回 `undefined`；否则 `walk` 渲染树按 `node.getData('uid') === uid` 匹配（含概要节点 `_generalizationList`），命中返回**节点实例**，未命中返回 `null`。官方插件 `Demonstrate.js:320` / `Cooperate.js:202` / `Search.js:138` 均用它做 uid → 实例定位，即引擎支持的官方途径
- 挂载链：`index.js:136` `this.renderer = new Render({...})`（构造时同步可用）、`Render.js:105` `this.textEdit = new TextEdit(this)`。据此在 `MindMapHandle`（src/types/engine.ts）新增可选成员 `renderer?: EngineRenderer`（`findNodeByUid` + `textEdit.hideEditTextBox`），并在 `simple-mind-map.d.ts` 显式声明 `renderer: EngineRenderer`（类的索引签名成员类型 `unknown` 不能满足可选接口成员，须显式声明）

### (7) 关键时序坑：`INSERT_CHILD_NODE` 会隐式关闭编辑框并**用旧框文本回写节点** —— 必须先关框

- `Render.js:903`：`insertChildNode` 首行即调 `this.textEdit.hideEditTextBox()`
- `TextEdit.js:475-504`：`hideEditTextBox()` 读取编辑框 DOM 当前内容 `getEditText()`，随后 `this.mindMap.execCommand('SET_NODE_TEXT', currentNode, text)`（:492）提交。若先 `SET_NODE_TEXT(node, lines[0])` 再插入子节点，编辑框仍显示粘贴前旧文本，这次隐式提交会**覆盖首行**（用户视角=粘贴拆分失败只剩子节点）
- 正确顺序（EditorView.applyMultilinePaste 采用）：`renderer.textEdit.hideEditTextBox()` → `SET_NODE_TEXT` → 循环 `INSERT_CHILD_NODE`。`hideEditTextBox` 在编辑框未打开时早退（:479-481），无条件调用无害
- `SET_NODE_TEXT` 实现走 `setNodeDataRender`（`Render.js:1750-1757` → `1987-1994`）：`execCommand('SET_NODE_DATA', ...)` + `node.reRender()`，变更入历史并触发 `data_change`（自动保存链路正常）

### (8) 持有节点实例跨多条连续命令的安全性 —— 成立

- `render()` 经 `setTimeout(..., 0)` 去抖（`Render.js:553-559`），同步连续多条 `execCommand` 的数据变更先落 `renderTree`，实际只触发最后一次渲染
- 渲染间节点实例按 uid 经 `nodeCache` 复用（`Render.js:574-576, 590-599`），未消失的节点实例在重渲染后保持有效；引擎自身 Command 撤销/重做同样持久化命令参数里的节点实例。`SET_NODE_TEXT` 后紧接 `INSERT_CHILD_NODE`（appointNodes 传同一实例）安全
- 补充：`INSERT_CHILD_NODE(openEdit=false, ...)` 在默认 `createNewNodeBehavior` 下 `focusNewNode=true`（`Render.js:756-764`），插入后会清空旧激活列表并激活新节点——`node_active` 随之发出新节点 uid，复制/粘贴的 activeUidRef 语义不受破坏。另存在 `INSERT_MULTI_CHILD_NODE`（`Render.js:263-266`，一次命令批量插子节点、单条历史），后续如需"整批一条撤销"可切换
