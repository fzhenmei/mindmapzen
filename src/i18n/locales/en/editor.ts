import type { Dict } from '../../en'

// Editor domain A (Task 7): zen bar / canvas shell / caption / stamps, nested
// per component; layouts keys map one-to-one to LayoutKind (three bar buttons
// plus two collapsed entries in the "more" dropdown). View-level error
// assembly lives in the global errors domain (Task 7 additions).
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
}
export default editor
