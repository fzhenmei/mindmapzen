import type { Dict } from '../../en'

// Idea basket entries (spec 2026-09-20-idea-basket-design): minimal set (recreate notice + error
// domain) plus the capture panel (Task 5), the target picker (Task 7) and the sort panel (Task 8)
const basket: Dict['basket'] = {
  basketRecreated: 'Basket file was recreated (the original may have been renamed or moved)',
  gitOffNotice: 'Version control is off: mounts cannot be auto-rolled back (enable it in Settings)',
  capture: {
    title: 'Capture an idea',
    placeholder: 'Idea in a flash…',
    hint: 'Enter to save · Shift+Enter for a new line · Esc to cancel',
    submitted: 'Saved to basket',
    openBasket: 'Open basket',
  },
  picker: {
    title: 'Choose a target',
    pickMap: 'Choose a map',
    searchMap: 'Search maps',
    searchNode: 'Search nodes',
    noMap: 'No maps available',
    loadFailed: 'Failed to read the target map',
  },
  errors: { noWorkspace: 'Set up a workspace first', readFailed: 'Failed to read the basket', writeFailed: 'Failed to write to the basket' },
  sort: {
    title: 'Sort the basket',
    empty: 'Basket is empty — press Ctrl+Alt+I to capture',
    pickTarget: 'Pick target…',
    clearTarget: 'Clear',
    discard: 'Discard',
    mountSelected: 'Mount selected',
    mounting: 'Mounting…',
    resultTitle: 'Mount results',
    resultOk: '{{n}} mounted',
    resultFail: '{{n}} failed',
    undo: 'Undo this mount',
    undone: 'Undone',
    failTargetNotFound: 'Target node no longer exists',
    failMapMissing: 'Target map no longer exists',
    failDepthTooDeep: 'Target is too deep to carry a body',
    failWriteFailed: 'Write failed',
    failRemoveBasket: 'Mounted, but basket cleanup failed',
    close: 'Close',
  },
}
export default basket
