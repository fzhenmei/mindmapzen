// src/i18n/locales/zh-CN/ai.ts —— AI 对话面板词典（2026-09 AI Agent v1，spec §7）
export default {
  toggle: 'AI 对话',
  panel: {
    title: 'AI 对话',
    close: '收起 AI 面板',
    placeholder: '问点什么，或让 AI 改这图…',
    send: '发送',
    stop: '停止',
    // 按轮悬浮复制（2026-09）：定稿回复/用户输入 hover 复制钮的无障碍名 + 失败 toast
    copyMessage: '复制此轮回复',
    copyInput: '复制此条输入',
    copyFailed: '复制失败，请重试',
    contextChip: '上下文：{{text}}',
    // 输入区（2026-09 长内容输入）：快捷键常显提示 + 拖高手柄无障碍名/悬停提示
    inputHint: 'Enter 发送，Shift + Enter 换行',
    resizeInput: '调整输入框高度',
    inputResizeTitle: '拖拽调整输入框高度，双击恢复默认',
    emptyTitle: '和 AI 一起写导图',
    emptyBody: '在下方输入想法，AI 可以增删节点、改写文本与正文、设图标标签、连线和折叠；AI 处理期间画布只读，随时可停。',
  },
  card: {
    add: '新增「{{text}}」',
    update: '改写节点文本',
    remove: '删除「{{text}}」',
    move: '移动「{{text}}」',
    body: '改写正文',
    icon: '设置图标 {{text}}',
    tag: '设置标签 {{text}}',
    expand: '调整展开/折叠',
    layout: '切换布局 {{text}}',
    link: '添加连线',
    unlink: '删除连线',
    failed: '（失败）',
  },
  turn: {
    badge: 'AI 处理中…',
    roundLimit: 'AI 工具调用超过 12 轮上限，已终止本回合（已做的修改保留，可撤销）',
    toolFailStreak: 'AI 连续 3 次工具执行失败，已终止本回合',
    transportUnavailable: '当前环境不支持 AI 网络调用（需在桌面应用内使用）',
    engineNotReady: '画布引擎未就绪：导图仍在加载，请稍候重试',
  },
  error: {
    network: 'AI 请求失败：{{message}}',
    notConfigured: 'AI 未配置：请到 案头 → 设置 → AI 填写 API 地址、密钥与模型名',
  },
  notice: {
    // v1.1 ②：git 备份未启用时首轮 AI 发送的安全网告知（会话级一次，聊天流信息卡）
    noBackup: '未开启版本管理：AI 编辑无自动备份安全网，误改可用 Ctrl+Z 逐命令撤销。可在 案头 → 设置 → 版本管理 开启自动提交。',
  },
  settings: {
    title: 'AI',
    baseUrl: 'API 地址（OpenAI 兼容）',
    baseUrlHint: '如 https://api.deepseek.com/v1（智谱/DeepSeek/Kimi/Ollama 均适用）',
    apiKey: 'API Key',
    apiKeyHint: '仅保存在本机配置文件，不随文档上传',
    model: '模型名',
    modelHint: '如 deepseek-chat、glm-4.6、kimi-k2-0905-preview',
    save: '保存 AI 配置',
    saved: 'AI 配置已保存',
  },
}
