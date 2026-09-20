import type { Dict } from '../../en'

// Idea basket entries (spec 2026-09-20-idea-basket-design): minimal set for this task
// (recreate notice + error domain); capture/sort-panel entries come with Task 5/8
const basket: Dict['basket'] = {
  basketRecreated: 'Basket file was recreated (the original may have been renamed or moved)',
  gitOffNotice: 'Version control is off: mounts cannot be auto-rolled back (enable it in Settings)',
  errors: { noWorkspace: 'Set up a workspace first', readFailed: 'Failed to read the basket', writeFailed: 'Failed to write to the basket' },
}
export default basket
