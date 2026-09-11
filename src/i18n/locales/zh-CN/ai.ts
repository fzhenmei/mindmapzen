// src/i18n/locales/zh-CN/ai.ts —— AI 对话面板词典（2026-09 AI Agent v1，spec §7）
export default {
  toggle: 'AI 对话',
  panel: {
    title: 'AI 对话',
    close: '收起 AI 面板',
    placeholder: '问点什么，或让 AI 改这图…',
    send: '发送',
    stop: '停止',
    contextChip: '上下文：{{text}}',
    emptyTitle: '和 AI 一起写导图',
    emptyBody: '在下方输入想法，AI 可以增删节点、改写文本、移动分支；AI 处理期间画布只读，随时可停。',
  },
  card: {
    add: '新增「{{text}}」',
    update: '改写节点文本',
    remove: '删除「{{text}}」',
    move: '移动「{{text}}」',
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
    stream: 'AI 连接中断：{{message}}',
    notConfigured: 'AI 未配置：请到 案头 → 设置 → AI 填写 API 地址、密钥与模型名',
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
