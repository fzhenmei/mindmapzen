import type { Dict } from '../../en'

const errors: Dict['errors'] = {
  gitNotEnabled: 'Version control is not enabled',
  nameEmpty: 'Name cannot be empty',
  nameInvalidChars: String.raw`Name cannot contain \ / : * ? " < > |`,
  mapNameExists: 'A map with this name already exists: {{name}}',
  renameInvalid: String.raw`Invalid new name (empty or contains \ / : * ? " < > |)`,
  sourceMapMissing: 'Source map not found: {{name}}',
  cannotDeleteRoot: 'Cannot delete the workspace root folder',
  cannotMoveRoot: 'Cannot move the workspace root folder',
  cannotMoveIntoSelf: 'Cannot move a folder into itself or one of its subfolders',
  targetDirNameExists: 'A folder with the same name already exists in the destination',
  setWorkspaceFailed: 'Failed to set workspace: {{reason}}',
  copyPathFailed: 'Failed to copy path: {{reason}}',
  copyMdFailed: 'Copy failed: {{reason}}',
  createMapFailed: 'Failed to create map: {{reason}}',
  readMapFailed: 'Cannot read the file (it may have been moved or deleted): {{reason}}',
  saveFailed: 'Failed to save: {{reason}}',
  saveLayoutFailed: 'Failed to save layout: {{reason}}',
  exportFailed: 'Failed to export: {{reason}}',
  copyImageFailed: 'Failed to copy image: {{reason}}',
  moveFailed: 'Failed to move: {{reason}}',
  importFailed: 'Failed to import: {{reason}}',
  deleteFailed: 'Failed to delete: {{reason}}',
  deleteDirFailed: 'Failed to delete folder: {{reason}}',
}
export default errors
