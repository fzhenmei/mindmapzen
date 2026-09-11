// src/i18n/locales/en/ai.ts —— English mirror of zh-CN/ai.ts (keys must match exactly)
export default {
  toggle: 'AI chat',
  panel: {
    title: 'AI Chat',
    close: 'Hide AI panel',
    placeholder: 'Ask anything, or let AI edit this map…',
    send: 'Send',
    stop: 'Stop',
    contextChip: 'Context: {{text}}',
    emptyTitle: 'Co-write mind maps with AI',
    emptyBody: 'Type below. AI can add/remove nodes, rewrite text and move branches. The canvas is read-only while AI works; you can stop anytime.',
  },
  card: {
    add: 'Added "{{text}}"',
    update: 'Rewrote node text',
    remove: 'Removed "{{text}}"',
    move: 'Moved "{{text}}"',
    failed: ' (failed)',
  },
  turn: {
    badge: 'AI working…',
    roundLimit: 'AI exceeded the 12-round tool-call limit; turn stopped (applied edits kept, undoable)',
    toolFailStreak: 'AI tools failed 3 times in a row; turn stopped',
    transportUnavailable: 'AI network calls are unavailable in this environment (desktop app only)',
  },
  error: {
    network: 'AI request failed: {{message}}',
    stream: 'AI connection lost: {{message}}',
    notConfigured: 'AI not configured: fill API URL, key and model in Library → Settings → AI',
  },
  settings: {
    title: 'AI',
    baseUrl: 'API URL (OpenAI-compatible)',
    baseUrlHint: 'e.g. https://api.deepseek.com/v1 (GLM/DeepSeek/Kimi/Ollama all work)',
    apiKey: 'API Key',
    apiKeyHint: 'Stored only in the local config file, never uploaded',
    model: 'Model name',
    modelHint: 'e.g. deepseek-chat, glm-4.6, kimi-k2-0905-preview',
    save: 'Save AI settings',
    saved: 'AI settings saved',
  },
}
