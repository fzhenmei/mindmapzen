import type { Dict } from '../../en'

// Idea basket entries (spec 2026-09-20-idea-basket-design): minimal set (recreate notice + error
// domain) plus the capture panel (Task 5) and the target picker (Task 7); sort-panel entries come
// with Task 8
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
}
export default basket
