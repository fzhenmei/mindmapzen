import type { FeatureGroup, WebsiteDict, WhyTool } from './zh'

// 英文文案:逐条对照中文直译(Sentence case、自然英文,不逐字硬译);
// 严守叙事红线:反向同步只说“重开即最新”、不说“粘回还原层级”;
// 能力描述对照 app 源码核译,不夸大;Markdown/XMind/PNG 等专有名词不译。
// 演示导图(MindMapFigure)根节点译作 Pomodoro——SVG 节点矩形宽度按中文字宽
// 固定,完整译名 Desktop Pomodoro 会溢出根节点框,故取短名并三层保持一致。

const WHY_TOOLS: WhyTool[] = [
  { name: 'mind-map-zen', self: true, cells: [true, true, true, true, true] },
  { name: 'XMind', cells: [true, true, 'Free-tier limits', 'Paid export', true] },
  { name: 'Freeplane', cells: [true, 'Weak Chinese UX', true, true, true] },
  { name: 'Mubu', cells: ['Outline only, no canvas', true, true, 'No Markdown export', true] },
  { name: 'Markmap family', cells: ['Auto-layout only', true, true, true, true] },
]

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: 'desk',
    title: 'Desk',
    description: 'Keep your maps tidy',
    items: [
      ['tree', ['Directory-tree navigation, filter by level']],
      ['outline', ['Outline preview: single-click to select, double-click to open']],
      ['move', ['Move maps and create folders']],
      ['file-ops', ['Create, rename, delete (to Recycle Bin)']],
    ],
  },
  {
    key: 'paper',
    title: 'Paper',
    description: 'Keyboard-first editing',
    items: [
      ['tab-enter', [{ code: 'Tab' }, ' creates a child, ', { code: 'Enter' }, ' creates a sibling']],
      ['drag', ['Drag to reshape hierarchy and order']],
      ['paste', ['Multi-line paste: one line, one node']],
      ['fold', ['Fold, zoom and pan']],
    ],
  },
  {
    key: 'link',
    title: 'Links',
    description: 'Clean and well-behaved',
    items: [
      ['link', [{ code: '[[name]]' }, ' two-way links']],
      ['clean', ['Markers hidden on canvas — links only']],
      ['curve', ['Drag to bend a curve; it survives reopen']],
      ['layouts', ['Mind map, logic and org-chart layouts']],
    ],
  },
  {
    key: 'io',
    title: 'In & out',
    description: 'Comes and goes freely',
    items: [
      ['import', ['Import ', { code: '.xmind' }, ' and ', { code: '.md' }]],
      ['copy', ['Copy the whole map or a subtree as Markdown']],
      ['export', ['Export PNG and SVG']],
      ['note', ['Node notes, saved as block quotes']],
    ],
  },
]

export const en: WebsiteDict = {
  html: {
    title: 'mind-map-zen — Every map is a single Markdown file',
    description:
      'A free, local-first mind mapping desktop app. Shape ideas on the canvas, talk to your AI in the file: free, local, offline, no account.',
  },
  navAria: 'Page navigation',
  download: 'Download',
  nav: [
    { href: '#why', label: 'Why' },
    { href: '#onefile', label: 'One map, one file' },
    { href: '#features', label: 'Features' },
  ],
  hero: {
    titleA: 'Every map is',
    titleB1: 'a single ',
    titleB2: ' file',
    subtitle: 'A free, local-first mind mapping app. Shape ideas on the canvas, talk to your AI in the file.',
    primary: 'Download for Windows',
    secondary: 'Why we built it',
    traits: ['Free', 'Local-first', 'Offline', 'No account'],
  },
  why: {
    heading: {
      eyebrow: '## Why',
      title: 'Couldn’t find it, so I built one',
      description:
        'Turning ideas into a mind map and feeding the Markdown to an AI is a workflow I repeat every week. I searched the existing tools — none of them did all of this at once:',
    },
    abilities: ['Free-form canvas', 'Chinese UX', 'Free without limits', 'Markdown read/write', 'Desktop & offline'],
    tools: WHY_TOOLS,
    ariaAbility: 'Capability',
    ariaYes: 'Supported',
    ariaNo: 'Not supported',
    closing:
      'Markdown is the lingua franca for talking to AI — it shouldn’t be buried in a mind map app’s “Export as…” menu. It should be the map itself.',
  },
  oneFile: {
    heading: {
      eyebrow: '[[ One map, one file ]]',
      title: 'The map is text',
      description: 'On disk, a map is just one Markdown file. The content is yours, not locked inside the app.',
    },
    points: [
      {
        mark: '.md',
        title: 'Single source of truth',
        body: 'Map content is saved as a Markdown outline. AI tools, grep and git can read it directly, with no export step in between.',
      },
      {
        mark: '⇄',
        title: 'Two-way sync',
        body: 'Edit the map freely and the file updates on every save. Or the other way around — edit the file directly, or let your AI edit it, and reopening the map shows the latest.',
      },
      {
        mark: 'Ctrl+C',
        title: 'One step to your AI',
        body: 'Copy the selected nodes and paste them into any AI chat — they arrive as a Markdown outline, no “export” step involved; you can also copy just a subtree.',
      },
      {
        mark: 'git',
        title: 'Built-in version history',
        body: 'Your workspace is backed up with git automatically; every change is a version you can roll back to — and even a rollback can be rolled back.',
      },
    ],
  },
  features: {
    heading: {
      eyebrow: '## Features',
      title: 'Desk & Paper',
      description:
        'In the app, the map list is called the Desk and the canvas is called the Paper — one gathers, the other spreads.',
    },
    groups: FEATURE_GROUPS,
  },
  downloads: {
    heading: {
      eyebrow: '## Download',
      title: 'Install and go',
      description: 'Free, no account, no limit on the number of maps. Every file is saved in your own workspace folder.',
    },
    packages: [
      { name: 'MSI installer', description: 'The standard Windows format, recommended', file: 'mind-map-zen.msi' },
      {
        name: 'NSIS installer',
        description: 'Lightweight installer, faster setup',
        file: 'mind-map-zen-setup.exe',
      },
      {
        name: 'Portable edition',
        description: 'A single executable, ready right after download',
        file: 'mind-map-zen.exe',
      },
    ],
    note: 'v2.9.0 · Windows 10 and later',
  },
  footer: {
    copyright: '© 2026',
    credits: 'Mind map engine simple-mind-map (MIT) · Fonts Noto Sans SC and JetBrains Mono (OFL)',
  },
  figure: {
    canvasAria:
      'Mind map canvas: the root node “Pomodoro” branching into “Core features”, “UI & interaction” and “To decide”',
    root: 'Pomodoro',
    branches: ['Core features', 'UI & interaction', 'To decide'],
    leaves: ['25-min focus cycles', 'Break reminders', 'Track stats?'],
    fileName: 'Pomodoro.md',
    aiTab: 'AI chat',
    prompt: 'Follow this outline and build V1 for me',
    syncLabel: 'Two-way sync',
    copyLabel: 'Ctrl+C to copy',
  },
}
