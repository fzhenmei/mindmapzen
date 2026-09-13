import type { Dict } from '../../en'

const workbench: Dict['workbench'] = {
  title: 'Workbench',
  toLibrary: 'Back to desk',
  scanning: 'Scanning work directory…',
  failedBar: '{{count}} map(s) failed to load',
  empty: {
    noDirTitle: 'No work directory yet',
    noDirBody:
      'Create a “Work” directory and put work-management maps in it (project plans, task lists…); keep creative maps (drafts, articles…) elsewhere. Move maps in and out anytime from the desk.',
    create: 'Create work directory',
    noTasks: 'No tasks with status markers in the work directory yet. Open a map and set a node status (todo/doing/…) — tasks will show up here.',
  },
  suggest: { section: 'Next up', finish: 'Finish what’s in progress', blocked: 'Waiting items — time to nudge?', staleTodo: 'Longest-shelved todos', staleMap: 'This work map has been idle for a week', askAi: 'Ask AI' },
  board: { section: 'Work plan' },
  recent: { section: 'Recent' },
  ai: { title: 'AI suggestions', disabledHint: 'Configure AI first in Settings (base URL / API key / model)', error: 'AI request failed', close: 'Close' },
}
export default workbench
