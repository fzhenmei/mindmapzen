import type { Dict } from '../../en'

// Editor domain A (Task 7): zen bar / canvas shell / caption / stamps, nested
// per component; layouts keys map one-to-one to LayoutKind (three bar buttons
// plus two collapsed entries in the "more" dropdown). View-level error
// assembly lives in the global errors domain (Task 7 additions).
// Editor domain B (Task 8): node action bar / multi-select bar / dialog
// cluster / body panel / outline / icon picker / image dialog / export /
// error panel / ignored banner / note tooltip. Shared actions (cancel, save,
// close, delete) live in common; hook-level errors live in the global errors
// domain.
const editor: Dict['editor'] = {
  zenbar: {
    backToDesk: 'Back to desk',
    settings: 'Settings',
    switchMap: 'Switch map (Ctrl+P)',
    newMap: 'New map',
    // Sort basket (2026-09 idea basket M1): ZenBar button shown only when the current map is the basket
    sortBasket: 'Sort basket',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    copyBranchTip: 'Copy selected branch as Markdown (Ctrl+C)',
    copyMultiTip: 'Copy selected branches as Markdown (Ctrl+C)',
    copyAllTip: 'Copy whole map as Markdown (Ctrl+C)',
    copyOptions: 'Copy options',
    copyIncludeLinks: 'Keep wikilink markers',
    copyIncludeBody: 'Include body text',
    copyIncludeIconStatus: 'Include icons & kanban status',
    copyPathTip: 'Copy file path (for AI to read directly)',
    aiImageHeader: '> Images are local absolute paths; read them with your tools',
    save: 'Save (Ctrl+S)',
    bodyPanel: 'Write body text for the selected node',
    exportImage: 'Export',
    zoomOut: 'Zoom out (Ctrl+scroll)',
    zoomIn: 'Zoom in (Ctrl+scroll)',
    centerRoot: 'Center root: return to root keeping zoom',
    fitView: 'Fit map',
    layoutToggle: 'Layout',
    moreLayouts: 'More layouts',
    layouts: {
      mindmap: 'Mind map (right)',
      logic: 'Logic diagram (left-right)',
      org: 'Org chart (down)',
      timeline: 'Timeline',
      fishbone: 'Fishbone',
    },
    // View toggle group (2026-09 kanban mode -> canvas tri-state): map / Markdown / kanban overlay (Ctrl+1/2/3 equivalents)
    viewToggle: 'View (Ctrl+1/2/3)',
    views: {
      mindmap: 'Map',
      markdown: 'Markdown',
      kanban: 'Kanban',
    },
    outlineShow: 'Show outline',
    outlineHide: 'Hide outline',
    // Copy for WeChat (2026-09 markdown-mode-only button): aria-label and tooltip share this key
    copyWechat: 'Copy for WeChat',
    archiveToggle: 'Archive column',
    expandLevel: 'Expand levels',
    expandAll: 'Expand all',
    expandToLevel: 'Expand to level {{n}}',
    searchNodes: 'Search nodes (Ctrl+F)',
  },
  nodeSearch: {
    title: 'Search nodes',
    placeholder: 'Type keywords to find nodes…',
    empty: 'No matching nodes',
    count: '{{count}} matches',
    countAll: '{{count}} nodes',
    escHint: 'Esc to close',
  },
  canvas: {
    loading: 'Opening…',
    emptyHint: 'With a node selected: Tab adds a child / Enter adds a sibling',
  },
  caption: {
    dirtyBadge: 'Unsaved changes',
    stats: '{{count}} nodes · {{savedAt}}',
    unsaved: 'Not saved',
  },
  stamps: {
    saved: 'Saved',
    copied: 'Copied',
    copiedMd: 'Copied as Markdown',
    copiedNode: 'Copied as node',
    noTarget: 'Select or hover a node first',
  },
  nodeActions: {
    body: 'Write body text for the selected node',
    icon: 'Node icon',
    tag: 'Node tags',
    // Task status (2026-09 kanban mode Task 8): floating-bar button, opens StatusPickerDialog
    status: 'Node status',
    image: 'Node image',
    link: 'Create link: click, then click the target node',
  },
  nodeMenu: {
    label: 'Node actions menu',
    insertChild: 'Add child node',
    insertSibling: 'Add sibling node',
    editText: 'Edit text',
    delete: 'Delete node',
  },
  multiSelect: {
    count: '{{count}} nodes selected',
    deleteSelected: 'Delete the {{count}} selected nodes',
    deleteTip: 'Delete selected nodes and their subtrees (Del works too, Ctrl+Z to undo)',
  },
  dialogs: {
    ignoredTitle: 'Saving will discard {{count}} unmapped content blocks',
    ignoreConfirm: 'Save anyway',
  },
  bodyPanel: {
    ariaLabel: 'Node body editor',
    close: 'Close the body editor',
    editorLabel: 'Node body text',
    hintNoSelection: 'Select a node on the canvas, then write its body text here',
    hintListNode: 'Body text is not available for deep list nodes',
    wordCount: '{{count}} characters',
    headingConverted: 'Headings are not supported in body text; {{count}} heading(s) converted to bold',
    imageSaveFailed: 'Failed to save image',
  },
  outline: {
    title: 'Outline',
    resizeLabel: 'Resize outline',
  },
  iconPicker: {
    title: 'Node icon',
    removeIcon: 'Remove {{name}}',
    searchPlaceholder: 'Search the full lucide set (by name or tag, e.g. flag / clock)',
    // Save gating: tooltip while a picked non-curated icon's svg is in flight
    svgLoading: 'Loading icon…',
  },
  tagPicker: {
    title: 'Node tags',
    removeTag: 'Remove {{name}}',
    inputPlaceholder: 'Type a new tag and press Enter',
  },
  // Status picker (2026-09 kanban mode Task 8): six status labels and the
  // clear entry reuse the kanban domain (one status vocabulary across views)
  statusPicker: {
    title: 'Node status',
  },
  imageDialog: {
    title: 'Node image',
    missing: 'Image file unreadable: {{path}}',
    empty: 'No image set',
    remove: 'Remove',
    paste: 'Paste',
    pick: 'Choose image',
    pasteNoImage: 'No image in the clipboard',
    pasteReadFailed: 'Failed to read clipboard: {{reason}}',
    fileFilter: 'Images',
  },
  export: {
    title: 'Export',
    // 2026-09-23 dialog reworked into two-group grid: section labels
    groupImage: 'Images',
    png: 'Export PNG',
    svg: 'Export SVG',
    copy: 'Copy as image',
    groupDoc: 'Documents',
    // 2026-09-23 Word/PDF export batch: document entries (PDF chain lands in Task 6)
    word: 'Export Word',
    pdf: 'Export PDF',
    // 2026-09-23 open-after-export: native ask dialog (title + message with file name)
    askOpenTitle: 'Open exported file',
    askOpen: 'Exported {{name}}. Open it now?',
  },
  errorPanel: {
    readTitle: 'Cannot open this file',
    parseTitle: 'Cannot open this map',
    readDetail: 'The file may have been moved, deleted, or is inaccessible',
    openOther: 'Open another map',
    rawEdit: 'Open as plain text to repair',
  },
  ignored: {
    banner: '{{count}} content blocks are unmapped (they will be discarded on save)',
    collapse: 'Collapse',
    details: 'Details',
    item: '{{type}}: {{excerpt}}',
  },
  noteTooltip: {
    more: 'Open the editor dialog (Shift+F2)',
  },
  // Kanban mode (2026-09 Task 6): KanbanView overlay trio; the six status
  // names map one-to-one to the statusMarkers whitelist; the menu icon/tag
  // entries reuse nodeActions.icon/tag
  kanban: {
    viewName: 'Kanban',
    status: {
      todo: 'To do',
      doing: 'In progress',
      blocked: 'Blocked',
      done: 'Done',
      dropped: 'Dropped',
      archived: 'Archived',
    },
    ungrouped: 'Ungrouped',
    emptyColumn: 'No tasks yet',
    filterPlaceholder: 'Filter tasks (title / path / tag)',
    filterEmpty: 'No matching tasks',
    collapseArchive: 'Collapse archive column',
    archiveAll: 'Archive all done',
    addPlaceholder: 'Type a task name and press Enter',
    menu: {
      toStatus: 'Set status',
      toPlain: 'Convert to plain node',
      // Locate on map (2026-09 acceptance change: moved from card click into the menu —
      // portal click bubbling caused false triggers and accidental view switches)
      locate: 'Locate on map',
      copyCard: 'Copy card',
      delete: 'Delete',
      deleteConfirm: 'Delete?',
    },
    bodyHint: 'Body',
    // Sub-item badge (2026-09 subtree cards): {{n}} = statusless descendants in card scope
    children: '{{n}} sub-items',
    cardHint: 'Double-click to rename',
  },
  // Markdown view (2026-09 canvas tri-state)
  markdown: {
    viewName: 'Markdown view',
    // Serialize-failure placeholder (poison-node family: newline / body-in-list assertion)
    renderFailTitle: 'Markdown render failed',
    renderFailBody: 'Current map data cannot be serialized; check node text (e.g. embedded line breaks) in mind map view',
    // Copy for WeChat (2026-09 markdown-mode ZenBar button; button label lives at zenbar.copyWechat):
    // {{reason}} = full-chain error string
    copiedToast: 'Copied for WeChat — paste into the WeChat article editor',
    copyWechatFailed: 'Copy for WeChat failed: {{reason}}',
  },
}
export default editor
