import type { Dict } from '../../en'

const settings: Dict['settings'] = {
  title: 'Settings',
  language: { label: 'Language', auto: 'Follow system', zh: '简体中文', en: 'English' },
  git: {
    toggle: 'Version control (auto-commit to workspace git repo)',
    remotePlaceholder: 'Remote repository HTTPS URL (leave empty for local-only commits)',
    tokenPlaceholder: 'Access token (PAT, required for private repos)',
    noCommit: 'No commits yet',
    lastCommit: 'Last commit: {{commit}}',
    ahead: ' · {{count}} unpushed',
    history: 'History',
    backupNow: 'Back up now',
  },
  tourReplay: 'Guided tour',
  tourReplayBtn: 'Replay',
  workspaceRow: 'Workspace: {{dir}}',
  workspaceUnset: 'Not set',
  changeWorkspace: 'Change workspace',
  exitWorkspace: 'Exit workspace (back to start screen)',
  exitBtn: 'Exit',
  close: 'Close',
}
export default settings
