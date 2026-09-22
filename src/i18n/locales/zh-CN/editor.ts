// 编辑器域 A(Task 7):砚栏(zenbar)/画布壳(canvas)/题签(caption)/印记(stamps)按组件嵌套;
// layouts 子域键集与 LayoutKind 一一对应(常用三钮 + 更多下拉收起两项共用);
// 视图内错误拼装归 errors 全局域(EditorView 三处,同 Task 6 setWorkspaceFailed 先例)。
// Task 8 续迁画布浮件(浮动条/多选条/正文面板)与编辑器对话框。
// 编辑器域 B(Task 8):节点浮动条(nodeActions)/多选条(multiSelect)/对话框簇(dialogs)/
// 正文面板(bodyPanel)/大纲(outline)/图标管理器(iconPicker)/插图(imageDialog)/
// 导出(export)/错误面板(errorPanel)/忽略块横幅(ignored)/备注悬停窗(noteTooltip);
// 通用动作(取消/保存/关闭/删除)走 common;hooks 报错走 errors 全局域。
export default {
  zenbar: {
    backToDesk: '返回案头',
    settings: '设置',
    switchMap: '切换导图（Ctrl+P）',
    newMap: '新建导图',
    // 整理篮子（2026-09 点子篮子 M1）：仅当前图 = 篮子图时出现的砚栏钮
    sortBasket: '整理篮子',
    undo: '回退（Ctrl+Z）',
    redo: '重做（Ctrl+Y）',
    copyBranchTip: '复制选中分支为 Markdown（Ctrl+C）',
    copyMultiTip: '复制所选分支为 Markdown（Ctrl+C）',
    copyAllTip: '复制整图为 Markdown（Ctrl+C）',
    copyOptions: '复制选项',
    copyIncludeLinks: '保留双链标记',
    copyIncludeBody: '含正文',
    copyIncludeIconStatus: '含图标与看板状态',
    copyPathTip: '复制文件路径（发给 AI 直接读取）',
    // 复制 md 给 AI 的图片头注(aiImagePaths 服务,内容型标记随界面语言)
    aiImageHeader: '> 图片为本地绝对路径，请用工具读取',
    save: '保存（Ctrl+S）',
    bodyPanel: '撰写选中节点的正文',
    exportImage: '导出或复制为图片',
    zoomOut: '缩小（Ctrl+滚轮）',
    zoomIn: '放大（Ctrl+滚轮）',
    centerRoot: '根居中：保持缩放回根',
    fitView: '适配整图',
    layoutToggle: '布局切换',
    moreLayouts: '更多布局',
    layouts: {
      mindmap: '思维导图（右向）',
      logic: '逻辑图（左右）',
      org: '组织结构图（向下）',
      timeline: '时间轴',
      fishbone: '鱼骨图',
    },
    // 视图切换组（2026-09 看板模式 → 画布三态）：导图 / Markdown / 看板浮层（Ctrl+1/2/3 同效）
    viewToggle: '视图切换（Ctrl+1/2/3）',
    views: {
      mindmap: '导图',
      markdown: 'Markdown',
      kanban: '看板',
    },
    outlineShow: '显示大纲',
    outlineHide: '隐藏大纲',
    archiveToggle: '归档列',
    // 展开层级（一键收起到 N 级）：缩放段单选下拉；N 级 = 可见到第 N 层分支（根不计级）
    expandLevel: '展开层级',
    expandAll: '全部展开',
    expandToLevel: '展开到 {{n}} 级',
    searchNodes: '搜索节点（Ctrl+F）',
  },
  // 节点搜索浮层（2026-09）：Ctrl+P 搜文件 / Ctrl+F 搜节点两族；命中列表跳转定位
  nodeSearch: {
    title: '搜索节点',
    placeholder: '输入节点关键词…',
    empty: '未找到匹配节点',
    count: '{{count}} 个匹配节点',
  },
  canvas: {
    loading: '正在打开…',
    emptyHint: '选中节点后：Tab 加子节点 / Enter 加同级节点',
  },
  caption: {
    dirtyBadge: '有未保存修改',
    stats: '{{count}} 节点 · {{savedAt}}',
    unsaved: '未保存',
  },
  stamps: {
    saved: '已存',
    copied: '已复制',
    copiedMd: '已复制为 Markdown',
    copiedNode: '已复制为节点',
    noTarget: '请先选中或悬停节点',
  },
  nodeActions: {
    body: '编写选中节点的正文',
    icon: '节点图标',
    tag: '节点标签',
    // 任务状态（2026-09 看板模式 Task 8）：浮条状态钮，开 StatusPickerDialog
    status: '节点状态',
    image: '节点插图',
    link: '创建连线：点此钮后再点目标节点',
  },
  nodeMenu: {
    label: '节点操作菜单',
    insertChild: '插入子节点',
    insertSibling: '插入同级节点',
    editText: '编辑文本',
    delete: '删除节点',
  },
  multiSelect: {
    count: '已选 {{count}} 个节点',
    deleteSelected: '删除所选 {{count}} 个节点',
    deleteTip: '删除所选节点及子树（Del 同效，Ctrl+Z 可撤销）',
  },
  dialogs: {
    ignoredTitle: '保存将丢弃 {{count}} 个未映射的内容块',
    ignoreConfirm: '继续保存',
  },
  bodyPanel: {
    ariaLabel: '节点正文编辑',
    close: '关闭正文编辑',
    editorLabel: '节点正文',
    hintNoSelection: '在画布选中节点后在此撰写正文',
    hintListNode: '深层列表节点暂不支持正文',
    wordCount: '{{count}} 字',
    // 正文插图（2026-09 与节点插图同口径）：落盘失败提示（vditor tip 显示）
    imageSaveFailed: '图片保存失败',
  },
  outline: {
    title: '大纲',
    resizeLabel: '调整大纲宽度',
  },
  iconPicker: {
    title: '节点图标',
    removeIcon: '移除 {{name}}',
    searchPlaceholder: '搜索 lucide 全集（名字或语义标签，如 flag / 时间）',
  },
  tagPicker: {
    title: '节点标签',
    removeTag: '移除 {{name}}',
    inputPlaceholder: '输入新标签，回车添加',
  },
  // 状态选择器（2026-09 看板模式 Task 8）：六态文案/清除项复用 kanban 域（跨视图一套状态语言）
  statusPicker: {
    title: '节点状态',
  },
  imageDialog: {
    title: '节点插图',
    missing: '图片文件不可读：{{path}}',
    empty: '未设置插图',
    remove: '移除',
    paste: '粘贴',
    pick: '选择图片',
    pasteNoImage: '剪贴板中没有图片',
    pasteReadFailed: '读取剪贴板失败：{{reason}}',
    // Task 16 兜底:插图文件选择器过滤器名(App.tsx pickImageFile 端口)
    fileFilter: '图片',
  },
  export: {
    title: '导出或复制图片',
    png: '导出 PNG',
    svg: '导出 SVG',
    copy: '复制为图片',
  },
  errorPanel: {
    readTitle: '无法打开此文件',
    parseTitle: '无法打开此导图',
    readDetail: '文件可能已被移动、删除或没有访问权限',
    openOther: '打开其他导图',
    rawEdit: '以纯文本打开修复',
  },
  ignored: {
    banner: '{{count}} 个内容块未映射（保存时将丢弃）',
    collapse: '收起',
    details: '查看详情',
    // 摘要行插值(zh 全角冒号/en 半角冒号+空格随词典,importPreview.item 先例)
    item: '{{type}}：{{excerpt}}',
  },
  noteTooltip: {
    more: '打开弹窗编辑正文(Shift+F2)',
  },
  // 看板模式（2026-09 Task 6）：KanbanView 浮层三件套；六态名与 statusMarkers
  // 白名单一一对应；菜单「图标/标签」两项复用 nodeActions.icon/tag
  kanban: {
    viewName: '看板',
    status: {
      todo: '待办',
      doing: '进行中',
      blocked: '受阻',
      done: '完成',
      dropped: '放弃',
      archived: '归档',
    },
    ungrouped: '未分组',
    emptyColumn: '暂无任务',
    filterPlaceholder: '过滤任务（标题 / 路径 / 标签）',
    filterEmpty: '无匹配任务',
    collapseArchive: '收起归档列',
    archiveAll: '归档全部完成',
    addPlaceholder: '输入任务名，回车添加',
    menu: {
      toStatus: '改状态',
      toPlain: '转为普通节点',
      // 回导图定位（2026-09 验收变更：原卡片单击定位移入菜单——portal 冒泡误触 + 误点切走）
      locate: '回导图定位',
      copyCard: '复制卡片',
      delete: '删除',
      deleteConfirm: '确认删除？',
    },
    bodyHint: '正文',
    // 子孙徽标（2026-09 子树卡片）：{{n}} = 截断范围内无状态后代数
    children: '{{n}} 子节点',
    cardHint: '双击编辑任务名',
  },
  // Markdown 视图（2026-09 画布三态）
  markdown: {
    viewName: 'Markdown 视图',
    // 序列化失败占位（毒节点家族：换行/列表层正文断言）
    renderFailTitle: 'Markdown 渲染失败',
    renderFailBody: '当前导图数据无法序列化为文档，请回导图检查节点内容（如文本中含换行）',
  },
}
