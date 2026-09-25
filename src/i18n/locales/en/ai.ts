// src/i18n/locales/en/ai.ts —— English mirror of zh-CN/ai.ts (keys must match exactly)
export default {
  toggle: 'AI chat',
  panel: {
    title: 'AI Chat',
    close: 'Hide AI panel',
    placeholder: 'Ask anything, or let AI edit this map…',
    send: 'Send',
    stop: 'Stop',
    // Per-message hover copy (2026-09): a11y names of copy buttons (reply / user input) + failure toast
    copyMessage: 'Copy this reply',
    copyInput: 'Copy this message',
    copyFailed: 'Copy failed, please retry',
    contextChip: 'Context: {{text}}',
    // Input area (2026-09 long-content input): always-on shortcut hint + resize handle a11y name/tooltip
    inputHint: 'Enter to send, Shift + Enter for newline',
    resizeInput: 'Resize input box',
    inputResizeTitle: 'Drag to resize the input box; double-click to reset',
    emptyTitle: 'Co-write mind maps with AI',
    emptyBody: 'Type below. AI can add/remove nodes, rewrite text and bodies, set icons/tags, link and fold. The canvas is read-only while AI works; you can stop anytime.',
    // Chat history banner (2026-09 persistence): shown when the opened map has past turns and
    // they are not loaded yet — only "Load" is offered here ("Restart" is a session action that
    // lives in the header, meaningless without a conversation); token impact stated in the copy
    historyBanner: 'This map has {{n}} rounds of past AI conversation. Loading them sends that history as context in new chats (higher token usage); otherwise you start a fresh session.',
    historyLoad: 'Load history',
    historySaveFailed: 'Failed to save AI chat history; this turn may not be recorded',
    // Restart session (2026-09 interaction rework): header icon button — shown only with a conversation while AI is idle
    restartSession: 'Restart session',
    restartSessionHint: 'Clear the current conversation and start fresh (history stays archived and loadable)',
    // Operation cards collapse (2026-09): details fold into a summary row at turn end, click to expand; failed count appended in red when present.
    // Rolling window (2026-09 bounded queue): latest 5 stay visible mid-turn, earlier ones fold — cardsOlder labels the earlier set
    cardsSummary: '{{n}} operations',
    cardsOlder: 'Earlier {{n}} operations',
    cardsFailed: ' · {{n}} failed',
  },
  card: {
    add: 'Added "{{text}}"',
    update: 'Rewrote node text',
    remove: 'Removed "{{text}}"',
    move: 'Moved "{{text}}"',
    body: 'Rewrote body',
    icon: 'Set icons {{text}}',
    tag: 'Set tags {{text}}',
    expand: 'Adjusted expand/collapse',
    layout: 'Switched layout {{text}}',
    link: 'Added link',
    unlink: 'Removed link',
    file: '{{text}}',
    failed: ' (failed)',
  },
  turn: {
    badge: 'AI working…',
    tokenHint: 'note token usage',
    roundLimit: 'AI exceeded the 12-round tool-call limit; turn stopped (applied edits kept, undoable)',
    toolFailStreak: 'AI tools failed 3 times in a row; turn stopped',
    transportUnavailable: 'AI network calls are unavailable in this environment (desktop app only)',
    engineNotReady: 'Canvas engine not ready: the map is still loading, try again shortly',
  },
  error: {
    network: 'AI request failed: {{message}}',
    notConfigured: 'AI not configured: fill API URL, key and model in Library → Settings → AI',
  },
  notice: {
    noBackup: 'Version control is off: AI edits have no automatic backup safety net; mistakes can be undone step by step with Ctrl+Z. Enable auto-commit in Library → Settings → Version control.',
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
