// 编辑器域 A(Task 7):砚栏(zenbar)/画布壳(canvas)/题签(caption)/印记(stamps)按组件嵌套;
// layouts 子域键集与 LayoutKind 一一对应(常用三钮 + 更多下拉收起两项共用);
// 视图内错误拼装归 errors 全局域(EditorView 三处,同 Task 6 setWorkspaceFailed 先例)。
// Task 8 续迁画布浮件(浮动条/多选条/正文面板)与编辑器对话框。
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
}
