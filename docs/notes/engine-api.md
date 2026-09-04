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

## M4 核验（Task 3，主题系统）

对 M4 主题接线四项假设逐条核验（路径相对 `node_modules/simple-mind-map`，版本 0.14.0-fix.3）。**结论先行：第 2 项假设不成立——主题键集中不存在 `activeBorderColor`/`activeBorderWidth`，选中态真实键名为 `hoverRectColor`（+`hoverRectRadius`），engineThemes 的对象已按真实键名落地；其余三项成立，其中 curve 布局支持范围比注释声明更宽（organizationStructure 实际已实现 curve 分支）。**

### (9) root/second/node 完整键集 —— 成立，以 default.js:73-196 为准

- `root`（`src/theme/default.js:73-113`）：`shape`、`fillColor`、`fontFamily`、`color`、`fontSize`、`fontWeight`、`fontStyle`、`borderColor`、`borderWidth`、`borderDasharray`、`borderRadius`、`textDecoration`、`gradientStyle`、`startColor`、`endColor`、`startDir`、`endDir`、`lineMarkerDir`、`hoverRectColor`、`hoverRectRadius`、`textAlign`、`imgPlacement`、`tagPlacement`
- `second`（`default.js:115-141`）：同 root 另加 `marginX`/`marginY`
- `node`（`default.js:143-169`）：同 second（三级及以下）
- `generalization`（`default.js:171-196`）：同 second（本项目不用概要节点，主题不覆盖）
- 顶层样式（连线/背景等，`default.js:2-71`）：`paddingX`/`paddingY`（:3-4，仅顶层有默认值）、`lineWidth`、`lineColor`、`lineStyle`（:25）、`rootLineKeepSameInCurve`（:27）、`backgroundColor`（:61）等
- 主题合并 `mergeTheme`（`src/utils/index.js:1679-1685`）：deepmerge 深合并，主题只需给出覆盖键，缺省键回落 default——引擎 `defineTheme` 内部即用它合并（见下）

### (10) 选中态键 `activeBorderColor`/`activeBorderWidth` **不存在** —— 假设修正为 `hoverRectColor`

- 全 `src/theme` 目录 grep `activeBorderColor|activeBorderWidth` 零命中；default.js 各层级键集中无任何 `active*` 前缀键
- 真实机制：hover 与激活共用同一个外框矩形 `smm-hover-node`（`src/core/render/node/nodeLayout.js:185-193` 创建，类名见 :190），样式在 `Style.hoverNode()`（`src/core/render/node/Style.js:343-351`）：

  ```js
  const hoverRectColor = this.merge('hoverRectColor') || this.ctx.mindMap.opt.hoverRectColor
  const hoverRectRadius = this.merge('hoverRectRadius')
  node.radius(hoverRectRadius).fill('none').stroke({ color: hoverRectColor })
  ```

- 显隐与浓淡由引擎内置 CSS 控制（`src/constants/constant.js:225-246`）：hover 态 opacity .6 / stroke-width 1，`.smm-node.active` 态 opacity 1 / stroke-width 2——即**选中态与 hover 同色，只是更浓更粗，主题层无法也无需区分两者**
- 回退链：主题各层级默认 `hoverRectColor: ''`（default.js:94/136/164，空串为 falsy）→ 回落实例选项 `opt.hoverRectColor`（`src/constants/defaultOptions.js:164`，默认 `rgb(94, 200, 248)` 亮蓝色，非本仓色板）。**故 zen 主题必须在 root/second/node 各层显式设置 `hoverRectColor`**——`Style.merge`（`Style.js:75-113`，层级键优先于顶层，:100-105）下，只设顶层会被各层默认空串拦截而失效
- **修正落地**：engineThemes.ts 的 root/second/node 用 `hoverRectColor: '#B5453C'`（纸墨）/ `'#C96A5F'`（夜墨）+ `hoverRectRadius: 6` 取代简报的 `activeBorderColor`/`activeBorderWidth`

### (11) `defineTheme` 纯静态注册、jsdom 安全 —— 成立（一个细节偏差）

- 实现 `index.js:836-841`：`MindMap.defineTheme(name, config)` 仅把 `mergeTheme(defaultTheme, config)` 写入模块级主题注册表（`src/theme/index.js`，初始仅 `{ default }`），不触 DOM、不依赖实例——jsdom 中直接 import 并调用安全
- 细节偏差：同名主题已存在时它 **return 一个 Error 对象而非 throw**（`index.js:837-839`），且该返回值无人消费——重复注册会静默无效。`registerZenThemes` 的模块级布尔守卫因此仍是必要语义（幂等不靠引擎报错），测试「可重复调用不抛」成立
- 消费侧：构造 opt `theme` 经 `initTheme`（`index.js:368-376`）取 `theme[this.opt.theme] || theme.default`——**未注册主题名静默回退默认主题**，故注册必须先于实例构造；`MindMapCanvas` 模块顶层（usePlugin 之后）调用 `registerZenThemes()` 满足时序
- `setTheme`（`index.js:379-386`）：`execCommand('CLEAR_ACTIVE_NODE')` 清选中 → `opt.theme = theme` → `render(null, CHANGE_THEME)` → `emit('view_theme_change', theme)`。不重建实例、不重挂载，M4 接线选它做运行中切换

### (12) `lineStyle: 'curve'` 布局支持范围 —— 注释与实现不一致，实际更宽

- `default.js:25` 注释：curve「仅支持 logicalStructure、mindMap、verticalTimeline 三种结构」——与简报假设（curve 支持 logicalStructure/mindMap，organizationStructure 用 straight）同源
- 但安装版本实现：四个布局的 `renderLine` 均有 curve 分支，**含 `OrganizationStructure.js:157-168`（`renderLineCurve` 定义于 :168）**。即注释为滞后文档，本仓三种布局（logicalStructure/mindMap/organizationStructure）下 curve 均实际生效；organizationStructure 的曲线为竖向贝塞尔
- `rootLineKeepSameInCurve`（`default.js:26-27`）注释限定 logicalStructure/mindMap；organizationStructure 根节点连线形状无该开关语义，置 true 无害

### d.ts 影响

新增静态方法 `defineTheme(name: string, config: Record<string, unknown>): void` 与实例方法 `setTheme(name: string): void`（返回 Error 对象的细节不进类型——守卫保证不会走到该分支），构造 opts 显式补 `theme?: string` 注释键。

## M5b 核验（Task 2，节点备注）

### (13) `SET_NODE_DATA` 接受部分 data，但**不触发重渲染** —— 成立，且须补一次重渲染

- `Render.js:1980-1984 setNodeData(node, data)`：仅 `Object.keys(data).forEach(key => node.nodeData.data[key] = data[key])` 平铺合并——传 `{ note }` 单键即可，无需整份 data
- 对比：`SET_NODE_TEXT`（Render.js:1987 `setNodeDataRender`）内部走 `SET_NODE_DATA` + `reRenderNodeCheckChange`（节点重渲 + 尺寸变化时全图重排）；裸 `SET_NODE_DATA` **不重渲**，备注角标（增/删）不会即时出现/消失
- 结论：保存备注后须补调 `renderer.reRenderNodeCheckChange(node)`（`Render.js:1997`，引擎自用的"改数据后按需重渲"入口；`node.reRender()` 重建节点内容含角标，尺寸变化时自动 `mindMap.render()`）

### (14) `nodeCreateContents` 备注角标与**原生悬停显示** —— 成立，无需 CSS title 兜底

- `nodeCreateContents.js:430-475 createNoteNode()`：`getData('note')` truthy 才渲染 `.smm-node-note` 角标（空串/undefined 均无角标——"空值清除角标"由此免费获得）
- 悬停为引擎原生：`node.on('mouseover')` 把 `noteEl`（构造时 append 到 body 的 fixed 定位 div，`innerText = getData('note')`）定位到 `getNoteContentPosition()` 并 `display:block`，`mouseout` 隐藏；仅当设置 `opt.customNoteContentShow` 时才改走自定义回调（本仓未设置）。另有 `node_note_click` 事件（本仓未用）
- `noteIcon` 默认选项（`defaultOptions.js:270`）提供默认图标与配色

### (15) `SET_NODE_DATA` 后的 `data_change` 与置脏链路 —— 成立（与文本编辑同路）

- `Command.js:60-77 exec` → `addHistory`（节流）→ 快照 JSON 变化才 emit `data_change`（`Command.js:127`）。备注写入改变树 JSON → 经 MindMapCanvas 既有监听进 `onTreeDataChange` 置脏 + 自动保存；`note: undefined` 被 `JSON.stringify` 丢弃，清除备注同样产生 JSON 差异，置脏成立
- 注意 `MindMapCanvas` 的 `afterExecCommand` 白名单不含 `SET_NODE_DATA`（悬停/激活高频误报脏）——置脏只依赖节流后的 `data_change`，文本编辑（`SET_NODE_TEXT`）已验证同链路可用

### d.ts 影响

`EngineRenderer` 增 `reRenderNodeCheckChange(node: unknown, notRender?: boolean): void`（Render.js:1997）；备注读取走节点实例 `getData('note')`（MindMapNode.js:1029，未进类型——`findNodeByUid` 返回 `unknown`，调用点结构断言）。

## M5b 核验（Task 3，节点连线）

对 [[..]] 双链 → 引擎关联线接线的关键引擎事实核验（路径相对 `node_modules/simple-mind-map`，版本 0.14.0-fix.3；插件入口为 `src/plugins/AssociativeLine.js`，插件实例挂 `mindMap.associativeLine`，instanceName 见 :763）。

### (a) 建线命令 `ADD_ASSOCIATIVE_LINE` —— 成立

- `AssociativeLine.js:99` 注册：`this.mindMap.command.add('ADD_ASSOCIATIVE_LINE', this.addLine)`，实现 `addLine(fromNode, toNode)`（:578 起）：目标无 uid 时先经 SET_NODE_DATA 补生成，再把目标 uid 追加进 fromNode 的 `associativeLineTargets`

### (b) `removeAllLines` 只删 SVG，不删数据 —— 真“清空”须删键后重绘

- `renderAllLines`（:210）每次先 `removeAllLines()`（仅移除 SVG 元素）再按节点 data 里的 `associativeLineTargets` 重建；要删一条线必须从节点 data 删 uid/样式键后触发重绘。宿主重建语义 = 清空全树 5 个关联线键（`associativeLineTargets`/`associativeLinePoint`/`associativeLineTargetControlOffsets`/`associativeLineText`/`associativeLineStyle`）后按 md 重写

### (c) 连线数据是节点 data 普通键 —— 会进 getData 但不泄入 md；命令层同 uid 去重

- 上述 5 键均挂在节点 `data` 上（addLine :633/:645 等），`getCopyData()`/`getData()` 会带上；但 `engineTreeToZen` 只读 text/note/expand，天然不泄入 md（连线是纯派生数据，不落盘）
- `addLine` 对同 from 节点重复目标 uid 去重（:592 `sameLine` 检查）防双建；宿主直写路径在 rebuildEngineLinks 内自行去重（Map + includes）

### (d) 无 `.smm-associative-line` 类 —— 容器类名与主题键实况

- 容器是引擎主入口 `index.js:200-201` 创建的 group：`this.associativeLineDraw = this.draw.group(); addClass('smm-associative-line-container')`；每条线由 drawLine（:261 起）直挂 2 个 path——可见线（stroke 主题色）+ 透明点击线（`color: 'transparent'`，宽为 activeWidth），箭头在 marker defs 内、文字为 group，均非直挂 path
- 线色/线宽走主题根键 `associativeLineColor`/`associativeLineWidth`（`src/theme/default.js:43-45`），经 SVG.js 属性着色；CSS 直染会波及透明点击线，不可取

### (e) 首帧渲染异步 —— onReady 时 root 为 null

- `Render.render` 经 `setTimeout(0)` 去抖（`Render.js:553-559`），引擎构造同步完成后首帧仍未落：`renderer.root` 为 null。首帧前的双链重建须一次性挂 `node_tree_render_end`（Render.js:171 等处 emit）等渲染结束再落线

### (f) `getData()` 首命令前数据未初始化

- 初始重建（onReady）不用 `mm.getData()` 作解析源，改用 EditorView 打开时自持的 engineTree；运行中（保存链 onSaved）才用 getData 取最新树

### (g) `getData()` 无参返回活引用 —— 直写 + renderAllLines 绕过命令系统

- `MindMapNode.js:1029-1031`：`getData(key)` 无参返回 `this.nodeData.data` 本体。直写关联线键后调 `associativeLine.renderAllLines()`：不 execCommand → 不进历史、不触发 data_change → 无置脏/自动保存循环
- 插件已订阅 `node_tree_render_end`/`data_change`（AssociativeLine.js:89/91）自动重绘，后续文本编辑引起的重排无需再触发重建

### (h) `[[x]]` 是普通文本 —— serialize/parse 字面保留

- md 层对 `[[..]]` 无任何特殊处理，roundtrip 属性测试无需改动；双链语义仅在 links.ts 解析与引擎渲染层

## M5b 核验（Task 5，导出与复制为图片）

路径相对 `node_modules/simple-mind-map`（版本 0.14.0-fix.3），插件入口 `src/plugins/Export.js`。

### (a) `doExport.png()/svg()` 返回 **base64 data URL 字符串，不是 Blob** —— 与计划假设相反

- `png(...args)`（Export.js:353-356）委托 `_image('image/png', ...)`（:333-346）：`getSvgData` 取 svg 串 → `fixSvgStrAndToBlob(str)` → `svgToPng(svgUrl, ...)` 最终 `resolve(canvas.toDataURL(format))`（:254）——**png() 返回 `data:image/png;base64,...` 字符串**（canvas.toDataURL 直出，不经 readBlob）
- `svg(name)`（:400-408）返回 `await this.fixSvgStrAndToBlob(str)`——**函数名有误导**：`fixSvgStrAndToBlob`（:411-422）内部 `new Blob` 后经 `readBlob(blob)`（src/utils/index.js:441-451）`FileReader.readAsDataURL` —— **返回的也是 data URL 字符串**（`data:image/svg+xml;base64,...`）
- 结论：宿主侧转换函数做 `dataUrlToBytes(dataUrl)`（`atob` 解码 base64 段 → Uint8Array），非 `blobToBytes`；png 链路依赖 `document.createElement('canvas')`（svgToPng :145），jsdom 不可用——组件测试走 fake mm，真链路由 E2E chromium 覆盖
- `svg(name)` 会把 `name` 写入 svg 首元素前的 `<title>`（:403）；png 链路的 name 参数未被使用（仅 `export()` 的浏览器下载文件名用）

### (b) 插件挂载 —— `MindMap.usePlugin(Export)` → 实例构造时挂 `mindMap.doExport`

- `Export.instanceName = 'doExport'`（Export.js:458）；`usePlugin`（index.js:822-829）仅入模块级 pluginList，实例构造时 `initPlugin`（:744-749）执行 `this[plugin.instanceName] = new plugin({ mindMap, pluginOpt })`
- 与 Drag/AssociativeLine 同款接线：MindMapCanvas 模块顶层 `MindMap.usePlugin(Export)` 即可，构造出的每个实例都带 `doExport`
- **不可走 `export(type, isDownload=true, name)`**（:24-34）：默认 `isDownload=true` 会触发 `downloadFile`（浏览器下载），Tauri 桌面端直接调 `doExport.png()`/`doExport.svg()` 方法取返回值

### (c) Tauri 侧核验（writeFile/writeImage/save）

- plugin-fs `writeFile(path: string | URL, data: Uint8Array | ReadableStream<Uint8Array>, options?)`（dist-js/index.d.ts:721）——二进制写盘直接用，经 FsAdapter 新增 `writeBytes` 收口（`writeTextFileAtomic` 只收字符串）
- plugin-clipboard-manager `writeImage(image: string | Image | Uint8Array | ArrayBuffer | number[])`（index.d.ts:52）——传 Uint8Array
- plugin-dialog `save(options?: SaveDialogOptions): Promise<string | null>`（index.d.ts:319），`defaultPath` 选项指定默认文件名；用户取消返回 null
- **capabilities 补充（与计划"无需改"相反）**：`dialog:default` 已含 `allow-save`；但 `fs:default` 不含 write-file、`clipboard-manager:default` 启用空集——`src-tauri/capabilities/default.json` 须补 `fs:allow-write-file`（scope `**`，同既有 fs 项）与 `clipboard-manager:allow-write-image`，否则运行时被权限拦截

### d.ts 影响

`src/types/simple-mind-map.d.ts` 增 `declare module 'simple-mind-map/src/plugins/Export.js'`；`MindMapHandle`（src/types/engine.ts）增可选 `doExport?: { png(name?: string): Promise<string>; svg(name?: string): Promise<string> }`。

## 验收核验（节点操作条 + 快捷建子 + 连线文本桥接）

验收轮三项接线的关键引擎事实（路径相对 `node_modules/simple-mind-map`，版本 0.14.0-fix.3）。

### (a) 快捷建子按钮 `isShowCreateChildBtnIcon` —— 默认已开，激活叶节点显示 "+"

- `constants/defaultOptions.js:294` 默认 `isShowCreateChildBtnIcon: true`；宿主在构造 opts 显式声明（防默认值漂移）。方法注册门控 `MindMapNode.js:157`，显隐门控 `:516-527`：**仅叶节点（childrenLength ≤ 0）且 isActive 时显示**，有子节点时 removeQuickCreateChildBtn（让位展开钮）
- 点击 → `INSERT_CHILD_NODE(true, [this])`（`core/render/node/quickCreateChildBtn.js:46`，true=插入后开编辑框），click 带 stopPropagation，不与宿主 Tab 快捷键（window 层）冲突；SVG class `smm-quick-create-child-btn`（E2E 观测点）
- 定位复用 `renderer.layout.renderExpandBtn`（quickCreateChildBtn.js:62），落在节点右缘——与展开钮同一锚位

### (b) `beforeAssociativeLineConnection` 构造 opt 钩子 —— stop 路径不自清建线态

- `AssociativeLine.js:563-575` completeCreateLine：先自环检查（`creatingStartNode.uid === node.uid` 直接 return，:564），再读 `this.mindMap.opt.beforeAssociativeLineConnection(toNode)`，返回真值即 `return`——**该路径不调 cancelCreateLine（:576 才调）**，宿主拦截后必须自己 `mm.associativeLine.cancelCreateLine()`，否则 isCreatingLine 残留、后续任意节点点击被误续线
- 钩子只收到 toNode；**源节点从 `mm.associativeLine.creatingStartNode` 取**（createLine :477 写入实例字段，cancelCreateLine :483 置 null）
- 建线入口 `createLineFromActiveNode()`（:449-454）：以 `renderer.activeNodeList[0]` 为源进入建线态，`creatingLine` 虚线随 mousemove（:101/:505-514）经 `checkOverlapNode`（:530-555）高亮悬停目标
- 事件面：`draw_click` 绑在 svg 自身（Event.js:51）——宿主 HTML 浮层按钮在 svg 外，点击不触发取消；node_click 先于 draw_click（DOM 冒泡：目标节点 → svg），完成建线时序成立

### (c) 宿主桥接语义（editor/linkBridge.ts）

- 桥接把源文本改写为 `源 [[目标文本]]`（SET_NODE_DATA 只合并键，Render.js:1980-1984）→ data_change 置脏 → 自动保存落盘；连线从不写引擎层（文本是唯一事实源），返回 true 阻断引擎 addLine
- 目标名不唯一时 resolveLinks 宽容丢弃：文本保留、线不显示（与手写 [[..]] 同语义）
- 节点 left/top 为画布内容坐标，容器像素 = 内容 × view.scale + view.x/y（View.transform() origin[0,0] 即 draw 变换，同引擎 getNodePosInClient :545-555 口径）——浮动操作条锚点计算据此

## M5d 核验（Task 2，连线净化）

路径相对 `node_modules/simple-mind-map`（版本 0.14.0-fix.3）。连线净化以 uid 会话注册表为显示层数据源，三项前提核验均成立。

### (a) uid 生成与稳定性 —— 构造期统一补齐进 data，`SET_NODE_DATA({text})` 后原样保留 —— 成立

- `index.js:181-191 handleData`：构造/`setData`/`updateData` 都先 `simpleDeepClone` 再 `createUidForAppointNodes([data], false, null, true)`（`src/utils/index.js:1002-1019`：缺 `data.uid` 即 `createUid()` 补齐，含概要节点）——uid 落在 **节点 data**（`nodeData.data.uid`），与渲染树/命令快照共享同一数据对象
- `Render.js:1980-1984 setNodeData`：仅 `Object.keys(data).forEach(key => node.nodeData.data[key] = data[key])` 平铺合并传入键——`SET_NODE_DATA({text})` 只覆写 text，**uid 不在补丁内即不动**（文本编辑、重命名同路）
- `MindMapNode.js:1029-1031 getData(key)` 读 `nodeData.data[key]`；首帧渲染后（`renderer.root` 就绪）全树 `getData('uid')` 可得（引擎自身 `findNodeByUid` 同源，Render.js:2094-2098）
- `Command.js:177-184 getCopyData()` → `copyRenderTree`（`utils/index.js:162-180`，`simpleDeepClone(root.data)` 整体深拷）**uid 随 data 进 `mm.getData()` 快照**——序列化按 uid 查注册表可行；引擎另有 `removeDataUid` 仅用于导出场景，getData 不走

### (b) rebuildEngineLinks 清 5 键不含 uid —— 成立

- MindMapCanvas `ASSOCIATIVE_KEYS` 五键均 `associativeLine*` 前缀，uid 不在清除列；净化剥离文本走同一"直写 data 本体"通道，只改 `data.text`，uid 不动

### (c) 直写 + `reRenderNodeCheckChange` 不触发 data_change —— 成立（打开净化不置脏）

- 直写 `data` 本体（`getData()` 无参返回活引用，M5b 核验 (g) 同通道）绕过 `execCommand` → 不进历史、不发 `data_change`（唯一发源地 `Command.js:127` addHistory 链与 `Render.js:752` undo/redo backForward，纯重渲不发）
- `reRenderNodeCheckChange`（`Render.js:1997`）：`node.reRender()` 重建节点内容 + 尺寸变化时 `mindMap.render()`（`Render.js:552-559` 经 `setTimeout(0)` 去抖的纯重渲）——无 addHistory、无 data_change，打开时批量剥离标记不会点亮脏标记/触发自动保存

### 已知边界（不阻塞，记录在案）

- 撤销栈首条快照是**含标记的构造时数据**：净化直写不进历史，加载后立即 Ctrl+Z 会把标记文本带回显示（连线随之消失）；任一后续编辑/保存自愈（md 事实源不变），连线删除 UI 属计划外

## M5d 核验（Task 5，连线弯曲记忆）

路径相对 `node_modules/simple-mind-map`（版本 0.14.0-fix.3）。弯曲记忆两处前提核验均成立，另发现一处必须适配的数据不变量。

### (d) offsets 数据结构 —— from 节点 data 上的**索引对齐数组**（非 uid 键）——成立，恢复按 targets 顺序回填

- `associativeLineTargetControlOffsets` 挂在**连线源节点** data 上，是**数组**，按索引与 `associativeLineTargets`（目标 uid 数组）逐位对齐；每项 `[{x,y},{x,y}]` = 贝塞尔两控制点相对连线起点/终点的**差值**（`AssociativeLine.js:617-634 addLine` 写入时即注释"保存的实际是控制点和端点的差值"）
- 读：`associativeLineUtils.js:274-305 getNodeLinePath`（渲染时 `offsets[targetIndex]`，命中则控制点 = 端点 + 偏移，未命中回落默认 S 曲线）；写：`addLine`（建线默认值）/ `associativeLineControls.js:155-216 onControlPointMouseup`（拖完写用户偏移）/ `AssociativeLine.js:647-681 removeLine`（删线按索引 filter 收敛）
- 引擎自身只写**稠密**数组（addLine 逐条 push、removeLine filter 紧缩）。宿主恢复时若写**稀疏**数组（空洞），渲染安全（getNodeLinePath 有 `offsets[targetIndex]` 判空）但**拖控制点即崩**：`onControlPointMousemove`（controls.js:60-118）与 `onControlPointMouseup`（:190 附近）直接读 `offsets[targetIndex][1].x` 无判空 → TypeError。**适配**：rebuild 写 offsets 时按引擎同款公式（computeNodePoints + computeCubicBezierPathPoints，即 addLine 原算式）把空洞补成默认差值，保持稠密

### (e) 控制点拖完置脏 —— 成立，既有 data_change 监听已覆盖，无需新增监听

- `onControlPointMouseup`（controls.js:155）拖完经 `this.mindMap.execCommand('SET_NODE_DATA', node, { associativeLineTargetControlOffsets, associativeLinePoint })` 落数据 → `Command.js:71-80 exec` 对 SET_NODE_DATA 不在豁免名单 → `addHistory()`（Command.js:92-130）数据有变即 `emit('data_change', data)` → MindMapCanvas 既有 data_change 监听透传 EditorView → pipeline.onTreeDataChange 置脏 + 5s 自动保存
- 控制点可拖开关 `enableAdjustAssociativeLinePoints` 默认 true（defaultOptions.js:426），无需显式开启

## v1.1 核验（撤销/重做，想法5）

对引擎撤销历史子系统逐项核验+实证（路径相对 `node_modules/simple-mind-map`，版本 0.14.0-fix.3；实证手段：jsdom 直构实例的一次性脚本 + 浏览器 e2e 经临时调试钩子直读 `command.history`；修复轮由审查复核后勘误两处实证结论，见 (2)(4)）。**结论先行：原生快捷键与 back_forward 历史态事件成立可直接用；但撤销栈存在三处上游缺陷，宿主已在 `src/editor/undoSeed.ts` + `MindMapCanvas` 构造选项补齐，否则「基线含未净化标记（自播种子竞态）/ 两条逻辑编辑合并为一条历史（粒度损失）/ 撤销一次即截断重做栈」三症全现。**

### (1) 命令与快捷键 —— 成立

- `Render.js:248/251` 注册 `BACK`/`FORWARD` 命令；`Command.js:51-57` 原生注册 `Control+z` → BACK、`Control+y` → FORWARD（**无 Ctrl+Shift+z**，该组合由宿主画布兜底层补译为 FORWARD）；`Command.js:67` BACK/FORWARD 在 addHistory 豁免名单（无重入）
- `Render.js:745-753 backForward`：清选中 → command.back/forward → `renderTree = data` → 重渲 → **无条件 `emit('data_change', data)`**——撤销重做走既有置脏/自动保存链，撤销结果随保存落盘（无需新链路）
- 历史态事件 `back_forward(activeHistoryIndex, history.length)`：`Command.js` addHistory(:128)/back(:143)/forward(:164)/clearHistory(:46) 四处发出 → `canUndo = index > 0`，`canRedo = index < length - 1`（实证载荷 [0,1]/[1,2]/[0,2]）

### (2) 构造器自播种子与宿主基线竞态 —— **缺陷一（v1.1 修复轮勘误并修复，审查裁定①）**

- 引擎共有**四个**补种/入史入口（v1.1 首轮笔记称「唯一入口 setMode」不实，勘误）：
  1. **构造器自播**（index.js:163-166）：`if (this.opt.addHistoryOnInit && this.opt.data) this.command.addHistory()`——`defaultOptions.js:268` 默认 **true**，且走的是**节流** addHistory（实际入史延后 addHistoryTime ms）
  2. `setData`（index.js:466-476）：clearHistory + addHistory（本项目不调用）
  3. `updateData`（index.js:461）：addHistory（本项目不调用）
  4. `setMode('edit')`（index.js:558-560）：栈空时 originAddHistory（本项目不调用）
- 首轮 jsdom 脚本「构造+首帧渲染后 history=0」系**节流时序伪影**：脚本只推进了 50ms，自播种子在构造后 100ms（默认节流窗）才落——不能作为「不播种子」的证据，勘误
- 竞态实况（浏览器复现，回归用例 `e2e/undoredo.spec.ts` 第二条在未修复 HEAD 上失败）：自播种子捕获的是**未净化构造数据**（含 [[..]] 标记、无连线 targets），与宿主 `seedUndoBaseline` 的「栈非空即跳过」竞态——自播先落则基线含标记（打开含连线文件后回退栈底，画布显示「A [[B]]」，标记带回显示层），且自播 push 连带 data_change 会**开图误置脏**。本仓 `addHistoryTime: 1` 把自播入史提前到 ~1ms（早于首帧渲染与净化），等于把竞态的败方固定为宿主
- 宿主修复：构造 opts 显式 **`addHistoryOnInit: false`** 关闭自播；`seedUndoBaseline` 在打开净化完成后（applyRegistryToEngine 尾部）**直写** `command.history = [JSON.stringify(mm.getData())]`，成为唯一确定基线路径。不走 `originAddHistory`：其必发 data_change（Command.js:127）→ 打开即误置脏（与「净化不置脏」语义冲突，M5d 核验 (c)）；直写零事件。基线取净化后现态（标记已剥离、targets 已落位），首条编辑的撤销落在净化态——**M5d 时代记录的「撤销栈首条快照是含标记的构造时数据」边界就此消除**

### (3) copyRenderTree 携带节点级瞬态键 `inserting` —— **缺陷二，宿主入史后剥离**

- `utils/index.js:162-181 copyRenderTree`：除 data/children 外的节点级键全量入快照——含 `Render.insertChildNode` 写入的瞬态标记 `inserting`（首渲时 MindMapNode.js:674-680 消费：删标记 + active + node_dblclick 自动开编辑框）
- 实证两症（浏览器直读历史栈）：插入后激活链的 SET_NODE_DATA（`Render.setNodeActive` :1642 内嵌）触发节流 addHistory，此时标记已被渲染消费、JSON 漂移 → **重复入史一条近似快照**；BACK 恢复含标记快照 → 重渲重开编辑框 + 再发 SET_NODE_DATA/SET_NODE_ACTIVE 命令链 → 尾随 addHistory 按 `slice(0, index+1)` 截断 → **撤销一次后重做栈永久少一级**
- 宿主修复：`sanitizeTopHistory` 在每次 back_forward（addHistory 尾随发出）剥除栈顶快照的 `inserting` 键（干净串零成本早退，幂等）。恢复出的快照干净后，两症的漂移比较均变相等而不再入史

### (4) 100ms 丢弃式节流合并历史粒度 —— **缺陷三，宿主收节流窗**（v1.1 修复轮措辞勘误）

- `utils/index.js:281 throttle` 是纯尾随节流：`if (timer) return`——**窗口内的后续调用整体丢弃**（非合并尾随）；`defaultOptions.js:189 addHistoryTime: 100`
- 症状（措辞勘误：节流触发时读的是**现树**，快照永远如实反映其落地时刻的树态，不存在「栈顶腐化」；丢的是调用不是数据）：插入（Tab）与文本提交（点画布 → hideEditTextBox → SET_NODE_TEXT，TextEdit.js:492）两条逻辑编辑，若提交的 addHistory 调用落入前一调用的节流窗被丢弃，且前一调用的定时器又先于数据写入落地——**提交不产生独立历史条目，两条逻辑编辑合并为一条（粒度损失）**：最后一条编辑无法单独撤销（Ctrl+Z 一步跨过），重做落点也回到合并前的树态而非用户撤销前所见；直到下一条命令入史才补上
- 宿主修复：构造选项 `addHistoryTime: 1`（窗口近零，命令变更即时入史）。副作用可控：入史 push 才发事件（同值去重在 addHistory 首行早退，激活类的 isActive 差异又被 copyRenderTree 的 removeActiveState 剥离吸收），事件量与语义一致

### (5) 空栈撤销重做的 data_change(undefined) —— 宿主丢弃无载荷转发

- `Render.js:752` 无条件 `emit('data_change', data)`——back/forward 空栈 no-op 时 data 为 undefined；而管线「无载荷视为必有变化」（展开命令同步上报约定）→ **空栈按 Ctrl+Z 会误置脏 + 一轮冗余自动保存**
- 引擎 data_change 全源码仅两处发源：Command.js:127（恒带载荷）与 Render.js:752（可能 undefined）→ MindMapCanvas 的 data_change 监听丢弃 undefined 载荷（既有展开同步上报走 afterExecCommand 独立通道，不受影响）

### (6) 快捷键焦点矩阵与对话框守卫

- 引擎 KeyCommand `defaultEnableCheck`（KeyCommand.js:100-110）只认 body 焦点（editNodeClassList 初始为空）→ 焦点在砚栏按钮时 Ctrl+Z/Y 引擎不响应；宿主画布 window 兜底层补位（body 焦点时引擎已 preventDefault，宿主 defaultPrevented 守卫保证不双发；`Control+Shift+z` 也在此层译为 FORWARD）
- 编辑框（contenteditable，挂 body）内不拦截（框内原生撤销优先）；对话框开着（Radix `[role="dialog"]` 焦点陷阱）不补位——维持「框下不撤销」
- 引擎 `setNodeActive` 内嵌 `execCommand('SET_NODE_DATA', {isActive})`（Render.js:1642）不在豁免名单——激活本身靠 copyRenderTree 的 isActive 剥离 + 同值去重免入史，无需宿主处理

### 已知边界（不阻塞，语义记录）

- **连线画线/拖弯不走撤销**：文本桥接的 SET_NODE_DATA 命令可撤销；但注册表直写（rebuildEngineLinks/净化剥离）绕过命令层，画线动作（registry push）不产生历史条目——Ctrl+Z 不会移除刚画的线（删除线/改文本可撤销）。与「连线是 md 派生数据」的设计一致
- **撤销含标记的文本编辑**：用户在节点里键入 `[[B]]` 提交后立即撤销，恢复的是编辑前快照（无标记）；若在保存再净化（onSaved applyRegistry）**之后**重做，重做目标快照可能仍含标记文本（净化直写不回写历史）——自愈边界：任一后续编辑/保存即恢复净化态（M5d 已知边界的残余形态，出现窗口极窄）

## v1.2 核验（M12a Task 3，方向键导航 KeyboardNavigation 插件）

接入方式：`MindMap.usePlugin(KeyboardNavigation)`（`src/plugins/KeyboardNavigation.js`，285 行，instanceName `'keyboardNavigation'`，:285）。对简报三则假设逐条核验（路径相对 `node_modules/simple-mind-map`，版本 0.14.0-fix.3）。**结论先行：三则全部成立——插件只注册四个裸方向键、按几何最近移动选中；编辑框打开期间引擎以「清空快捷键表」而非 isPause 拦截（机制比简报假设更强）；宿主兜底层不触碰方向键，同窗双监听有序无双发。**

### (a) 几何/KEY_DIR 语义 —— 成立

- `constant.js:31-36` `KEY_DIR = { LEFT:'Left', UP:'Up', RIGHT:'Right', DOWN:'Down' }`；`keyMap.js:24-27` 对应键码 37/38/39/40（与浏览器方向键 keyCode 一致）。插件构造时对四个方向分别 `keyCommand.addShortcut(KEY_DIR.x, handler)`（KeyboardNavigation.js:20-32）
- `onKeyup(dir)`（:68-75）：无激活节点时任意方向键 `GO_TARGET_NODE(root)` 聚焦根；有激活节点走 `focus(dir)`
- `focus(dir)`（:78-127）三算法逐级兜底，全部纯几何、取中心点欧氏距离最近者（`checkNodeDis` 严格 `<`，等距时保留先遍历到者——bfsWalk 树序）：①阴影算法（目标与当前节点在按键方向上投影重叠，:169-205）→ ②区域算法（中心点差值落入方向扇区，:208-242）→ ③简单算法（目标整体在按键方向一侧，:130-166）；命中即 `GO_TARGET_NODE`
- `Render.js:369` 注册命令 `GO_TARGET_NODE` → `goTargetNode`（Render.js:1966-1975）：按 uid 展开到节点 → `targetNode.active()`（加 `active` class，MindMapNode.js:579，并触发 `node_active` 事件）→ `moveNodeToCenter`
- E2E 断言锚点即 `g.active`：激活节点的 SVG `<g class="smm-node active">`

### (b) 编辑框打开时不劫持方向键 —— 成立（机制与简报假设有偏差，且更强）

- 简报假设「TextEdit 保存/恢复 KeyCommand 的 isPause」**不实**：`isPause` 全引擎仅 Demonstrate 演示插件使用（Demonstrate.js:86/125）；真实机制是**换表**——编辑框打开 `TextEdit.showEditTextBox` emit `before_show_text_edit`（TextEdit.js:298，缩放重建的 `isFromScale` 场景不重发）→ `Render.js:415-417` `startTextEdit()` → `keyCommand.save()`（KeyCommand.js:43-50）把 `shortcutMap` 整体缓存进 `shortcutMapCache` 后**清空**；关闭 `hideEditTextBox` emit `hide_text_edit`（TextEdit.js:499）→ `endTextEdit()` → `restore()` 换回
- 空表期间 `KeyCommand.onKeydown` 遍历 `Object.keys(this.shortcutMap)` 为空——方向键（连同引擎注册的 Tab/Enter/Del/Control+a）一条都不会命中，框内方向键只剩 contenteditable 原生光标移动
- 拦截确实依赖换表而非焦点过滤：`TextEdit.js:39` 构造时即 `addEditNodeClass('smm-node-edit-wrap')`，编辑框 div 冒泡到 window 的 keydown（target=编辑框）**能通过** `defaultEnableCheck`（KeyCommand.js:100-110 遍历 `editNodeClassList` 放行）——若无换表，框内方向键会真触发 GO_TARGET_NODE。顺带勘误 v1.1 核验 (6) 括注「editNodeClassList 初始为空」：TextEdit 构造（随引擎实例化）即注册编辑框 class，并非空表
- `checkKey`（KeyCommand.js:153-170）是键码多重集精确匹配：裸 `'Right'`（k=[39]）对 Shift+Right（origin=[16,39]）长度不等直接不命中——**Shift/Ctrl/Alt+方向组合一律不劫持**
- 行为断言（e2e/keyboard-nav.spec.ts 第二用例）：框内连按四方向 → 编辑框不关闭、激活节点不漂移。若被劫持，`goTargetNode → targetNode.active()` 会先发 `before_node_active`，TextEdit 对其监听 `hideEditTextBox`（TextEdit.js:73-75）——编辑框会被立即关闭，断言即失败

### (c) 与宿主 window 兜底层无冲突 —— 成立

- 宿主 `MindMapCanvas.onKeydown` → `handleEngineKeyDown`（engineKeyboard.ts）只映射 Tab/Enter/Delete 三键，方向键返回 false：不 preventDefault、不 execCommand
- 同窗双监听顺序：引擎 `KeyCommand.onKeydown` 在构造时绑定（KeyCommand.js:88），宿主兜底在 useEffect 内后绑——引擎先收。方向键命中时引擎 `preventDefault()+stopPropagation()`（KeyCommand.js:135-137；stopPropagation 不拦同节点后续监听，preventDefault 可见），宿主以 `e.defaultPrevented` 守卫早退（MindMapCanvas.tsx onKeydown 首行）；Tab/Enter/Delete 同理由引擎原生快捷键先应答（Render.js:384/392/407），宿主仅兜「焦点落在非 body 元素」的引擎不响应场景——无双发（该序在 E2E 复制用例中已实证，见 M2 核验「键盘处理」节）
- KeyboardNavigation 不触碰 Tab/Enter/Delete：插件只 addShortcut 四个方向键（KeyboardNavigation.js:20-32），Tab 建子/Enter 建同级/Delete 删节点语义不变
- 引擎核心不注册裸方向键：Render.js 快捷键全集（:384-452）仅含 Control+Up/Down 缩放组合（:430/:434，M3 笔记所称「方向键」即此）——键码多重集与插件裸方向键不同，Ctrl+上下缩放不受插件影响

## 圈选核验（2026-09，Select 插件：圈选多节点批量操作）

接入方式：`MindMap.usePlugin(Select)`（`src/plugins/Select.js`，239 行，instanceName `'select'`，:237）。结论先行：**默认选项（`useLeftKeySelectionRightKeyDrag: false`）下插件同时支持空白处 Ctrl/Cmd+左键拖拽与裸右键拖拽两种圈选起手，左键平移语义零改动**；批量删除（REMOVE_NODE 无参）与批量拖拽（Drag 按激活列表）为引擎既有能力，宿主仅修选中镜像。E2E 锚点：`multi-select-bar` / `multi-select-delete`（e2e/multiselect.spec.ts）。

### (a) 触发条件与平移不冲突 —— 成立

- 触发判定（Select.js:49-54）：`!(e.ctrlKey || e.metaKey) && (opt ? e.which !== 1 : e.which !== 3)` 才跳过——默认（false）下 **Ctrl/Cmd+任意键** 或 **裸右键（which===3）** 进入圈选；置 true 则翻转为裸左键圈选 + 右键拖画布（本仓不用，保持左键 pan 原语义）
- 左键 pan 不受影响：'drag' 平移事件仅在 `isLeftMousedown`（默认选项）时派发（Event.js:123-131），裸右键圈选根本不进 drag 分支；Ctrl+左键虽进 drag 分支但 View.js:44 对 Ctrl/Cmd 早退——两种圈选起手均不 pan（中键平移亦不变）
- 节点上起手不圈选：节点 group 的 mousedown 对非中键 `stopPropagation()`（MindMapNode.js:353-376），el 层监听收不到——圈选只能从空白起手；在节点上右键=激活该节点+派发 `node_contextmenu`（宿主未监听），Ctrl+左键=切换多选（`enableCtrlKeyNodeSelection`，MindMapNode.js:377-391），均为既有语义
- 拖拽阈值 10px（Select.js:77-82），未超阈值不进圈选态（`isSelecting`）

### (b) 右键圈选松开不清选中 —— 成立（contextmenu 的 5px 位移判定）

- 右键松开后 Windows 在同点位派发 contextmenu：svg 的 contextmenu 监听（Event.js 注册）→ `clearActiveNodeListOnDrawClick(e, 'contextmenu')`（Render.js:154-156）
- 该函数对 contextmenu 事件在默认选项下启用 5px 位移判定（Render.js:477-486）：mousedownPos 与松开点距离 ≤5px 才视为真点击清空——圈选拖拽必然 >10px（插件自身阈值），**不会误清**；右键单击空白（<5px）清选中为既有语义不变
- 圈选进行中右键点节点不激活：MindMapNode.js:441-447 对 `node_contextmenu` 有 `mindMap.select.hasSelectRange()`（Select.js:221-224，即 isSelecting）避让

### (c) 命中测试与事件载荷 —— node_active 第二参为权威

- `checkInNodes`（Select.js:179-219，300ms 节流）：`draw.transform()` 取 {scale, translate} 把选区与节点盒（left/top/width/height）统一到容器像素坐标后 `checkTwoRectIsOverlap`；BFS 全树含概要节点，框内/框外动态 `addNodeToActiveList` / `removeNodeFromActiveList` 并逐次 `emitNodeActiveEvent()`
- **载荷陷阱**：圈选过程中的 `emitNodeActiveEvent()` 无参调用 → `node_active` 首参为 `null`、激活列表只在第二参（Render.js:456-467，setTimeout(0) 去抖 + 同表不发）——宿主 `onActive` 此前只读第一参（单选语义成立），圈选下必须读第二参提取 uid 数组（MindMapCanvas.tsx 圈选镜像，useActiveSelection.activeUid 退化为「恰好单选」语义）
- 拖到画布边缘 <50px 触发 AutoMove 自动滚屏（Select.js:83-118）——E2E 圈选框坐标须留边距，否则视口漂移导致断言集意外

### (d) 选框颜色与批量语义

- 选框颜色硬编码 `#0984e3` 蓝（Select.js:165-176，svg.js 写 stroke/fill 为 presentation attribute）；宿主以 CSS 属性选择器覆盖为青松主题色（App.css，CSS 规则优先级恒高于 presentation attribute，不改 node_modules）
- 批量删除：`REMOVE_NODE` 无参即删全部 `activeNodeList` 各连带子树（Render.js:1413-1461；选中含根=清空根的所有子树，一条撤销记录）；Del/Backspace 引擎原生注册（Render.js:406-409）+ 宿主 engineKeyboard 兜底，圈选后直接生效
- 批量移动：Drag 插件按下激活节点时 `beingDragNodeList` = 激活列表的顶层祖先集合（Drag.js:258-273），`MOVE_NODE_TO`（reparent，Render.js:1589-1604）与 `INSERT_BEFORE/AFTER`（调序）均收数组——圈选后拖任一选中节点即批量移动
- readonly 守卫：插件 onMousedown/onMousemove 对 `opt.readonly` 早退（本仓未启用 readonly）
