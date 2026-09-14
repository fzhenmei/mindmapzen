import type { Dict } from '../../en'

const workbench: Dict['workbench'] = {
  title: 'Workbench',
  toLibrary: 'Back to desk',
  scanning: 'Scanning work directory…',
  // 标点入词条：en 侧不渗全角冒号/顿号（正字法随语言，分隔符在调用侧按 i18n.language 取）
  failedBar: '{{count}} map(s) failed to load: ',
  createFailed: 'Failed to create work directory',
  empty: {
    noDirTitle: 'No work directory yet',
    noDirBody:
      'Create a “Work” directory and put work-management maps in it (project plans, task lists…); keep creative maps (drafts, articles…) elsewhere. Move maps in and out anytime from the desk.',
    create: 'Create work directory',
    noTasks: 'No tasks with status markers in the work directory yet. Open a map and set a node status (todo/doing/…) — tasks will show up here.',
  },
  // itemJoin：建议行理由与目标的分隔符（en 半角冒号+空格，不渗全角正字法）
  suggest: { section: 'Next up', finish: 'Finish what’s in progress', blocked: 'Waiting items — time to nudge?', staleTodo: 'Longest-shelved todos', staleMap: 'This work map has been idle for a week', askAi: 'Ask AI', itemJoin: ': ' },
  board: { section: 'Work plan' },
  recent: { section: 'Recent' },
  ai: { title: 'AI suggestions', disabledHint: 'Configure AI first in Settings (base URL / API key / model)', error: 'AI request failed', thinking: 'AI is analyzing your tasks…', stop: 'Stop', feeNote: 'AI consults consume tokens and may incur costs, depending on your AI service' },
}
export default workbench
