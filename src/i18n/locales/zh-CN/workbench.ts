// 工作台（驾驶舱）词条（spec 2026-09-13-workbench-design）
export default {
  title: '工作台',
  toLibrary: '去案头',
  scanning: '正在聚合工作目录…',
  // 冒号收进词条（zh 全角 / en 半角+空格）：调用侧只拼 names，标点不硬编码在 JSX
  failedBar: '{{count}} 张图读取失败：',
  createFailed: '创建工作目录失败',
  empty: {
    noDirTitle: '还没有工作目录',
    noDirBody:
      '建一个「工作」目录，把工作管理类的导图放进来（项目计划、任务清单等）；创作类导图（文章草稿等）放其他目录，互不打扰。随时可以在案头把导图移动进出。',
    create: '创建工作目录',
    noTasks: '工作目录里还没有带状态标记的任务。打开导图给节点选择状态（待办/进行中/…），任务就会出现在这里。',
  },
  // itemJoin：建议行理由与目标的分隔符（zh 全角冒号 / en 半角+空格），不硬编码在 JSX
  suggest: { section: '下一步建议', finish: '进行中的事，先收尾', blocked: '等待中的事，看是否该催', staleTodo: '搁置最久的待办', staleMap: '这张工作图一周没动了', askAi: '问问 AI', itemJoin: '：' },
  board: { section: '工作计划' },
  recent: { section: '最近' },
  ai: { title: 'AI 建议', disabledHint: '先在设置中配置 AI（服务地址 / API Key / 模型名）', error: 'AI 请求失败', thinking: 'AI 正在分析你的任务清单…', stop: '停止', askAgain: '再问一次', feeNote: 'AI 咨询会消耗 Token，可能产生费用——取决于你接入的 AI 服务' },
}
