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
    // Turn progress (2026-09, pairs with graceful wrap-up): elapsed + round while a turn is running, gone when idle
    turnProgress: '{{elapsed}} · Round {{round}}',
    resizeInput: 'Resize input box',
    inputResizeTitle: 'Drag to resize the input box; double-click to reset',
    emptyTitle: 'Co-write mind maps with AI',
    emptyBody: 'Type below. AI can add/remove nodes, rewrite text and bodies, set icons/tags, link and fold. The canvas is read-only while AI works; you can stop anytime.',
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
    failed: ' (failed)',
  },
  turn: {
    badge: 'AI working…',
    // Graceful wrap-up at the round limit: injected as a user-role prompt so the model summarizes (final request carries no tools)
    wrapupPrompt: '[System] The tool-call round limit has been reached. Do not call any more tools; summarize the completed work and remaining steps directly.',
    // Fallback when the wrap-up request itself fails (neutral notice, not an error card — edits kept, can resume)
    wrapupFailed: 'Tool-call round limit (20) reached; applied edits are kept — send "continue" to resume',
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
