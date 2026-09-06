// website/src/content/zh.ts —— 官网中文文案(html 头 + 各 section;en 同构)
// 结构照抄改造前各组件顶部的常量数组与 JSX 文案,逐字搬运:
// 中文版渲染必须与改造前零差异(含半角逗号等原有标点习惯)。

/** 功能卡条目段:字符串 = 普通文本;{ code } = 原 <Code> 内联等宽标记 */
export type FeatureSeg = string | { code: string }
/** 功能卡条目:[稳定 key, 内容段序列],key 供列表渲染使用 */
export type FeatureItem = [key: string, segs: FeatureSeg[]]
/** 功能卡分组:key 与组件内图标表一一对应 */
export type FeatureGroup = {
  key: 'desk' | 'paper' | 'link' | 'io'
  title: string
  description: string
  items: FeatureItem[]
}
/** 「为什么」对比表单元格:true = 满足;string = 不满足的原因 */
export type WhyCell = true | string
export type WhyTool = { name: string; self?: boolean; cells: WhyCell[] }

const WHY_TOOLS: WhyTool[] = [
  { name: 'mind-map-zen', self: true, cells: [true, true, true, true, true] },
  { name: 'XMind', cells: [true, true, '免费版限制', '导出付费', true] },
  { name: 'Freeplane', cells: [true, '中文体验差', true, true, true] },
  { name: '幕布', cells: ['大纲式,无画布', true, true, '不支持导出', true] },
  { name: 'Markmap 系', cells: ['仅自动布局', true, true, true, true] },
]

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: 'desk',
    title: '案头',
    description: '把导图放整齐',
    items: [
      ['tree', ['目录树导航,按层过滤']],
      ['outline', ['大纲预览:单击选中,双击打开']],
      ['move', ['移动导图、新建目录']],
      ['file-ops', ['新建、重命名、删除(进回收站)']],
    ],
  },
  {
    key: 'paper',
    title: '纸面',
    description: '键盘流编辑',
    items: [
      ['tab-enter', [{ code: 'Tab' }, ' 建子节点,', { code: 'Enter' }, ' 建同级']],
      ['drag', ['拖拽调整层级与顺序']],
      ['paste', ['多行粘贴,一行一个节点']],
      ['fold', ['折叠展开、缩放平移']],
    ],
  },
  {
    key: 'link',
    title: '连线',
    description: '干净而听话',
    items: [
      ['link', [{ code: '[[名称]]' }, ' 双链连线']],
      ['clean', ['画布隐藏标记,只留连线']],
      ['curve', ['拖弯的曲线,重开仍在']],
      ['layouts', ['导图、逻辑、组织三种布局']],
    ],
  },
  {
    key: 'io',
    title: '输入输出',
    description: '进出自如',
    items: [
      ['import', ['导入 ', { code: '.xmind' }, ' 与 ', { code: '.md' }]],
      ['copy', ['复制整图或子树 Markdown']],
      ['export', ['导出 PNG、SVG']],
      ['note', ['节点备注,写入引用块']],
    ],
  },
]

export const zh = {
  html: {
    title: 'mind-map-zen — 每张导图,就是一个 Markdown 文件',
    description: '本地优先的免费思维导图桌面应用。画布上整理想法,文件里与 AI 对话:免费、本地、离线、无账号。',
  },
  navAria: '页面导航',
  download: '下载',
  nav: [
    { href: '#why', label: '为什么' },
    { href: '#onefile', label: '一图一文件' },
    { href: '#features', label: '功能' },
  ],
  hero: {
    titleA: '每张导图,',
    titleB1: '就是一个 ',
    titleB2: ' 文件',
    subtitle: '本地优先的免费思维导图。画布上整理想法,文件里与 AI 对话。',
    primary: '下载 Windows 版',
    secondary: '为什么做它',
    traits: ['免费', '本地优先', '离线可用', '无账号'],
  },
  why: {
    heading: {
      eyebrow: '## 为什么',
      title: '找不到,就自己写一个',
      description: '用导图整理想法、再转成 Markdown 喂给 AI,是每周都在重复的工作流。找遍市面工具,没有一个同时做到这几件事:',
    },
    abilities: ['自由画布', '中文体验', '免费无限制', 'Markdown 读写', '桌面离线'],
    tools: WHY_TOOLS,
    ariaAbility: '能力',
    ariaYes: '满足',
    ariaNo: '不满足',
    closing: 'Markdown 是与 AI 交流的通用语——它不该藏在导图软件的「导出为…」菜单里, 它应该就是导图本身。',
  },
  oneFile: {
    heading: {
      eyebrow: '[[ 一图一文件 ]]',
      title: '导图,即文本',
      description: '一张导图在磁盘上就是一个 Markdown 文件。内容属于你,不锁在软件里。',
    },
    points: [
      {
        mark: '.md',
        title: '唯一事实源',
        body: '导图内容以 Markdown 大纲存盘。AI、grep、git 都能直接读,不经过任何导出步骤。',
      },
      {
        mark: '⇄',
        title: '双向同步',
        body: '自由修改导图,文件随保存自动更新;也可以相反——直接改文件,或让 AI 改,重新打开导图即是最新。',
      },
      {
        mark: 'Ctrl+C',
        title: '一键喂给 AI',
        body: '选中节点复制,粘贴进任意 AI 对话框就是 Markdown 大纲,没有「导出」这一步;也可以只复制一个子树。',
      },
      {
        mark: 'git',
        title: '内置版本历史',
        body: '工作区自动 git 备份,每次改动都有版本,随时回滚——回滚本身也能再回滚。',
      },
    ],
  },
  features: {
    heading: {
      eyebrow: '## 功能',
      title: '案头与纸面',
      description: '软件里,导图列表叫「案头」,画布编辑叫「纸面」。一收一放,各安其位。',
    },
    groups: FEATURE_GROUPS,
  },
  downloads: {
    heading: {
      eyebrow: '## 下载',
      title: '装上就用',
      description: '免费,无账号,无导图数量限制。所有文件都保存在你自己的工作区文件夹里。',
    },
    packages: [
      { name: 'MSI 安装包', description: 'Windows 标准安装格式,推荐', file: 'mind-map-zen.msi' },
      { name: 'NSIS 安装包', description: '轻量安装器,安装更快', file: 'mind-map-zen-setup.exe' },
      { name: '免安装版', description: '单个可执行文件,下载即用', file: 'mind-map-zen.exe' },
    ],
    note: 'v2.9.0 · Windows 10 及以上',
  },
  footer: {
    copyright: '© 2026',
    credits: '导图引擎 simple-mind-map(MIT)· 字体 Noto Sans SC、JetBrains Mono(OFL)',
  },
  figure: {
    canvasAria:
      '思维导图画布:根节点「桌面番茄钟」,分出「核心功能」「界面与交互」「待定」三个分支',
    root: '桌面番茄钟',
    branches: ['核心功能', '界面与交互', '待定'],
    leaves: ['25 分钟专注循环', '休息提醒', '要不要统计？'],
    fileName: '桌面番茄钟.md',
    aiTab: 'AI 对话框',
    prompt: '照这个大纲,帮我实现 V1',
    syncLabel: '双向同步',
    copyLabel: 'Ctrl+C 复制',
  },
}
export type WebsiteDict = typeof zh
