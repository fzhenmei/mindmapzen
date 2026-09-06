import type { Dict } from '../../en'

// Library domain: sidebar tree / library view / file detail / dialogs / welcome
// screen, nested per component; keys shared by tree rows and detail action
// group sit at the root; templates feeds the template service descriptions
const library: Dict['library'] = {
  favorite: 'Favorite',
  unfavorite: 'Unfavorite',
  moveToDir: 'Move to folder',
  dirTree: {
    searchLabel: 'Search workspace files',
    searchPlaceholder: 'Search workspace files…',
    sort: 'Sort',
    sortModified: 'Modified time (new to old)',
    sortName: 'Name (A to Z)',
    favorites: 'Favorites',
    favoritesToggle: 'Collapse or expand favorites',
    directories: 'Folders',
    collapseDir: 'Collapse “{{name}}”',
    collapseAll: 'Collapse all',
    searchEmpty: 'No matching files',
    fileMenuLabel: 'Actions for “{{name}}”',
    dirMenuLabel: 'Folder actions',
    newMapHere: 'New map here',
    newSubdir: 'New subfolder',
    deleteDir: 'Delete folder',
  },
  library: {
    emptyHint: 'A blank page. Create a map and turn ideas into .md.',
    newMap: 'New map',
    importMd: 'Import .md',
    newDir: 'New folder',
    newDirTooltip: 'Create a folder in the workspace root',
    newDirTooltipIn: 'Create a folder in “{{dir}}”',
    settings: 'Settings',
  },
  fileDetail: {
    previewFailedTitle: 'Cannot preview this file',
    previewFailedBody: 'It may have been moved, deleted, or is not accessible',
    showOutline: 'Show outline',
    hideOutline: 'Hide outline',
    closePreview: 'Close preview',
    copyPath: 'Copy file path',
    openMap: 'Open map',
    moreActions: 'More actions',
    meta: '{{size}} · Created {{created}} · Modified {{modified}}',
  },
  dialogs: {
    rename: { title: 'Rename map' },
    newDir: { title: 'New folder', titleIn: 'New folder in “{{dir}}”', confirm: 'Create' },
    deleteDir: {
      title: 'Delete folder “{{name}}”?',
      summaryMaps: '{{count}} maps in this folder will be moved to the trash with the folder.',
      summarySubdirs: 'This folder has no maps but contains subfolders; they will be moved to the trash with the folder.',
      summaryEmpty: 'This folder is empty and will be moved to the trash directly.',
    },
    deleteMap: {
      title: 'Delete “{{name}}”?',
      body: 'It will be moved to the trash (.md and .zen.json deleted together).',
    },
    move: {
      title: 'Move “{{name}}”',
      root: 'Root folder',
      alreadyHere: 'Already in this folder',
      moveToRoot: 'Move to workspace root',
      newDirPlaceholder: 'New folder name',
      newDirAdd: 'Create',
      confirm: 'Move',
    },
    newMap: {
      title: 'New map',
      titleIn: 'New map in “{{dir}}”',
      templateSelect: 'Select template',
      confirm: 'Create',
    },
    importPreview: {
      title: 'Import “{{name}}”',
      body: '{{count}} content blocks were not mapped and will not appear in the map:',
      confirm: 'Import',
    },
  },
  welcomeScreen: {
    tagline: 'Turn ideas into .md',
    chooseWorkspace: 'Choose a workspace folder',
  },
  templates: {
    workspace: 'Workspace template',
    workspaceIn: 'Workspace template · {{dir}}',
  },
}
export default library
