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
    switchMap: 'Switch map (Ctrl+P)',
    newMap: 'New map',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    copyBranchTip: 'Copy selected branch as Markdown (Ctrl+C)',
    copyAllTip: 'Copy whole map as Markdown (Ctrl+C)',
    copyOptions: 'Copy options',
    copyIncludeLinks: 'Keep wikilink markers',
    copyIncludeBody: 'Include body text',
    copyPathTip: 'Copy file path (for AI to read directly)',
    aiImageHeader: '> Images are local absolute paths; read them with your tools',
    save: 'Save (Ctrl+S)',
    bodyPanel: 'Write body text for the selected node',
    exportImage: 'Export or copy as image',
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
  },
  nodeActions: {
    body: 'Write body text for the selected node',
    icon: 'Node icon',
    image: 'Node image',
    link: 'Create link: click, then click the target node',
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
    ariaLabel: 'Node body panel',
    close: 'Collapse body panel',
    editorLabel: 'Node body text',
    hintNoSelection: 'Select a node on the canvas, then write its body text here',
    hintListNode: 'Body text is not available for deep list nodes',
    wordCount: '{{count}} characters',
  },
  outline: {
    title: 'Outline',
    resizeLabel: 'Resize outline',
  },
  iconPicker: {
    title: 'Node icon',
    removeIcon: 'Remove {{name}}',
    searchPlaceholder: 'Search the full lucide set (by name or tag, e.g. flag / clock)',
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
    title: 'Export or copy image',
    png: 'Export PNG',
    svg: 'Export SVG',
    copy: 'Copy as image',
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
  },
  noteTooltip: {
    more: 'Open the panel to read the full text',
  },
}
export default editor
