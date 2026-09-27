// src/i18n/locales/zh-CN/ai.ts —— AI 对话面板词典（2026-09 AI Agent v1，spec §7）
export default {
  toggle: 'AI 对话',
  // 案头 AI 文件整理（2026-09 案头 AI）：右缘竖条入口 + 组装面板文案
  desk: {
    toggle: 'AI 整理',
    title: 'AI 整理',
    placeholder: '描述想要的整理效果，AI 先出方案…',
    emptyTitle: '让 AI 整理文件',
    emptyBody: '描述你想要的整理效果，AI 会先给出方案；你确认后才执行改名、移动与建目录。',
  },
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
    // 链接接管（spec §5）：消息内链接 opener 外开失败的 toast
    openLinkFailed: '打开链接失败，请重试',
    contextChip: '上下文：{{text}}',
    // 输入区（2026-09 长内容输入）：快捷键常显提示 + 拖高手柄无障碍名/悬停提示
    inputHint: 'Enter 发送，Shift + Enter 换行',
    // 回合进度（2026-09 轮次上限优雅收尾配套）：进行中耗时+轮次，结束即消失
    turnProgress: '{{elapsed}} · 第 {{round}} 轮',
    resizeInput: '调整输入框高度',
    inputResizeTitle: '拖拽调整输入框高度，双击恢复默认',
    emptyTitle: '和 AI 一起写导图',
    emptyBody: '在下方输入想法，AI 可以增删节点、改写文本与正文、设图标标签、连线和折叠；AI 处理期间画布只读，随时可停。',
    // 历史对话提醒（2026-09 持久化）：打开有历史流水的导图时置顶 banner——此时只提供载入
    // （「重新开始」是会话操作归 header，无对话时无意义）；Token 影响写进文案；落盘失败走 toast
    historyBanner: '此导图有 {{n}} 轮历史对话。载入后新对话将携带这些历史作为上下文，Token 消耗会相应增加；不载入则从新会话开始。',
    historyLoad: '载入历史',
    historySaveFailed: 'AI 对话记录保存失败，本轮对话可能未入档',
    // 重新开始会话（2026-09 交互重构）：header 图标钮——有对话且 AI 空闲才显示
    restartSession: '重新开始会话',
    restartSessionHint: '清空当前会话，从新对话开始（历史已存档，仍可载入）',
    // 操作卡片收起（2026-09）：回合收尾明细卡折叠成摘要行，点击展开；有失败时追加红色失败计数。
    // 滚动窗口（2026-09 有界队列）：回合中恒显最新 5 条，较早的折进摘要——cardsOlder 标较早组
    cardsSummary: '{{n}} 项操作',
    cardsOlder: '较早的 {{n}} 项操作',
    cardsFailed: ' · {{n}} 项失败',
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
    file: '{{text}}',
    skill: '技能 {{text}}',
    failed: '（失败）',
  },
  turn: {
    badge: 'AI 处理中…',
    tokenHint: '注意 Token 消耗',
    // 轮次上限优雅收尾：注入 user 角色提示让模型总结进度（末次请求不带工具）
    wrapupPrompt: '[系统提示] 工具调用轮次已达上限，请不要再调用工具，直接总结已完成的工作与剩余步骤。',
    // 收尾请求自身网络失败时的降级文案（中性 notice，非错误卡——修改已保留可继续）
    wrapupFailed: '已达工具轮次上限（20），已完成的修改保留；发送「继续」可接着完成',
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
  // skill 引导（2026-09 skill 接入，spec §4.7）：首次配 key 启用时推编辑器会话的 notice 文案
  skill: {
    connected: 'AI 已接入「{{name}}」，试试点击下方示例开始：',
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
    // 技能小节（2026-09 skill 接入，spec §4.6）：遍历注册表渲染
    skillsTitle: '技能',
    getKey: '获取 API Key',
    skillsHint: '技能凭据仅存本机，不上传；配置后 AI 可调用对应技能。',
  },
}
