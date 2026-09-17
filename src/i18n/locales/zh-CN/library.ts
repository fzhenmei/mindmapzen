// 案头域:左树(dirTree)/案头视图(library)/文件详情(fileDetail)/对话框(dialogs)/
// 开屏(welcomeScreen)按组件嵌套;favorite 等左树与详情动作组共用键置根;
// templates 子域供模板服务用户模板描述(内置模板名/描述不走词典,见 Task 14 registry)
export default {
  favorite: '收藏',
  unfavorite: '取消收藏',
  moveToDir: '移动到目录',
  // Task 16 兜底:案头左栏拖拽手柄 aria-label 与导入文件选择器过滤器名(App.tsx 端口)
  resizeSidebar: '调整侧栏宽度',
  importFileFilter: '导图文件',
  dirTree: {
    searchLabel: '搜索工作区文件',
    searchPlaceholder: '搜索工作区文件…',
    sort: '排序',
    sortModified: '修改时间（新→旧）',
    sortName: '名称（A→Z）',
    favorites: '收藏',
    favoritesToggle: '收起或展开收藏',
    directories: '目录',
    collapseDir: '折叠「{{name}}」',
    collapseAll: '折叠全部',
    searchEmpty: '没有匹配的文件',
    fileMenuLabel: '「{{name}}」操作',
    dirMenuLabel: '目录操作',
    newMapHere: '在此新建导图',
    newSubdir: '新建子目录',
    deleteDir: '删除目录',
  },
  library: {
    emptyHint: '空白的纸。新建一张导图，让想法落成 .md。',
    newMap: '新建导图',
    importMd: '导入 .md',
    newDir: '新建目录',
    newDirTooltip: '在工作区根下新建目录',
    newDirTooltipIn: '在「{{dir}}」下新建目录',
    settings: '设置',
  },
  // fileDetail（2026-09 画布三态 M2 清理）：详情态退役后仅存浮窗与树右键菜单在用词条
  // （大纲/打开/更多/元信息类随 FileDetail/DetailActions 删除）
  fileDetail: {
    previewFailedTitle: '无法预览此文件',
    previewFailedBody: '文件可能已被移动、删除或没有访问权限',
    closePreview: '关闭预览',
    copyPath: '复制文件路径',
    copyWechat: '复制为公众号格式',
    copyWechatFailed: '复制为公众号格式失败：{{reason}}',
  },
  dialogs: {
    rename: { title: '重命名导图' },
    newDir: { title: '新建目录', titleIn: '在「{{dir}}」新建目录', confirm: '创建' },
    deleteDir: {
      title: '删除目录「{{name}}」？',
      summaryMaps: '该目录下 {{count}} 张导图将随目录一并移入回收站。',
      summarySubdirs: '该目录下没有导图，但含子目录，将随目录一并移入回收站。',
      summaryEmpty: '该目录为空，将直接移入回收站。',
    },
    deleteMap: { title: '删除「{{name}}」？', body: '将移入回收站（.md 与 .zen.json 一起删除）。' },
    move: {
      title: '移动「{{name}}」',
      root: '根目录',
      alreadyHere: '已在当前目录',
      moveToRoot: '移动到工作区根',
      newDirPlaceholder: '新目录名',
      newDirAdd: '新建',
      confirm: '移动',
    },
    newMap: { title: '新建导图', titleIn: '在「{{dir}}」新建导图', templateSelect: '选择模板', confirm: '创建' },
    importPreview: {
      title: '导入「{{name}}」',
      body: '{{count}} 个内容块未映射，这些内容不会出现在导图中：',
      // 摘要行插值(zh 全角冒号/en 半角冒号+空格随词典)
      item: '{{type}}：{{excerpt}}',
      confirm: '导入',
    },
    // 「从 Git 库打开」克隆对话框（CloneDialog）
    clone: {
      title: '从 Git 库打开',
      url: 'Git 库地址',
      urlPlaceholder: 'https://git.example.com/repo.git',
      username: '用户名（私有库填写，可选）',
      password: '密码 / Token（私有库填写，可选）',
      location: '克隆位置',
      browse: '浏览…',
      targetPreview: '将克隆到：{{path}}',
      confirm: '克隆',
      cloning: '正在克隆…',
    },
  },
  welcomeScreen: {
    tagline: '想法落成 .md',
    chooseWorkspace: '选择工作区文件夹',
    cloneFromGit: '从 Git 库打开',
  },
  templates: {
    workspace: '工作区模板',
    workspaceIn: '工作区模板 · {{dir}}',
  },
}
