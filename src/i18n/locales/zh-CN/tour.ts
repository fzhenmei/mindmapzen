// 漫游引导(spec §4.1):示例图名 + 遮罩按钮 + 10 步 title/body;zh 值与旧 tourSteps/TourOverlay 文案逐字一致
export default {
  sampleMapName: '漫游示例',
  overlay: {
    skip: '跳过',
    prev: '上一步',
    next: '下一步',
    done: '完成',
  },
  steps: {
    welcome: {
      title: '欢迎来到 Mind Map Zen',
      body: '这是一款本地优先的思维导图工具，约 1 分钟带你逛完核心功能。随时可点「跳过」，之后能在设置里重新观看。',
    },
    newMap: {
      title: '新建导图',
      body: '输入名称、挑选模板即可建图。双击案头里的导图随时进入编辑。',
    },
    import: {
      title: '导入已有内容',
      body: '支持导入 Markdown 大纲与 XMind 文件，直接变成导图。',
    },
    dirs: {
      title: '目录组织',
      body: '左侧目录树管理工作区里的文件夹与导图——单击文件即可预览，双击直接进入编辑。',
    },
    toEditor: {
      title: '进入编辑器',
      body: '接下来带你看看编辑器。我们将自动打开一张「漫游示例」导图作为演示对象，引导结束后它会留在工作区，可以随意练手。',
    },
    zenbar: {
      title: '命令栏',
      body: '底部命令栏集中了常用操作：返回案头、切换导图、复制 Markdown、保存等，鼠标悬停可看快捷键。',
    },
    layout: {
      title: '布局切换',
      body: '常用布局一键直达：思维导图、逻辑图、组织结构图；时间轴、鱼骨图收在「更多」里。',
    },
    body: {
      title: '节点正文',
      body: '选中节点后在右侧面板撰写正文，支持手写 Markdown 语法，随导图文件一起保存。',
    },
    export: {
      title: '导出图片',
      body: '一键把导图导出为 PNG/SVG，或直接复制到剪贴板。',
    },
    finish: {
      title: '开始你的第一张导图',
      body: '「漫游示例」已留在工作区，可以拿它练手。现在就去新建一张属于自己的导图吧！',
    },
  },
}
