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
}
export default errors
