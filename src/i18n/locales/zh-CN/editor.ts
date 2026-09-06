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
    switchMap: '切换导图（Ctrl+P）',
    newMap: '新建导图',
    undo: '回退（Ctrl+Z）',
    redo: '重做（Ctrl+Y）',
    copyBranchTip: '复制选中分支为 Markdown（Ctrl+C）',
    copyAllTip: '复制整图为 Markdown（Ctrl+C）',
    copyOptions: '复制选项',
    copyIncludeLinks: '保留双链标记',
    copyIncludeBody: '含正文',
    copyPathTip: '复制文件路径（发给 AI 直接读取）',
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
  },
  nodeActions: {
    body: '编写选中节点的正文',
    icon: '节点图标',
    image: '节点插图',
    link: '创建连线：点此钮后再点目标节点',
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
    ariaLabel: '节点正文面板',
    close: '收起正文面板',
    editorLabel: '节点正文',
    hintNoSelection: '在画布选中节点后在此撰写正文',
    hintListNode: '深层列表节点暂不支持正文',
    wordCount: '{{count}} 字',
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
  imageDialog: {
    title: '节点插图',
    missing: '图片文件不可读：{{path}}',
    empty: '未设置插图',
    remove: '移除',
    paste: '粘贴',
    pick: '选择图片',
    pasteNoImage: '剪贴板中没有图片',
    pasteReadFailed: '读取剪贴板失败：{{reason}}',
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
  },
  noteTooltip: {
    more: '打开面板查看全文',
  },
}
