// 错误域:store/服务层用户可见报错(appStore 用键 + Task 6 案头服务层补全)
export default {
  gitNotEnabled: '未启用版本管理',
  nameEmpty: '名称不能为空',
  nameInvalidChars: String.raw`名称不能包含 \ / : * ? " < > |`,
  mapNameExists: '已存在同名导图：{{name}}',
  renameInvalid: String.raw`新名称非法（为空或包含 \ / : * ? " < > |）`,
  sourceMapMissing: '源导图不存在：{{name}}',
  cannotDeleteRoot: '不能删除工作区根目录',
  cannotMoveRoot: '不能移动工作区根目录',
  cannotMoveIntoSelf: '不能移动到自身或其子目录内',
  targetDirNameExists: '目标目录下已存在同名目录',
  setWorkspaceFailed: '设置工作区失败：{{reason}}',
  // Task 7 编辑器视图错误拼装(EditorView 组件内 t() 取值)
  copyPathFailed: '复制路径失败：{{reason}}',
  copyMdFailed: '复制失败：{{reason}}',
  createMapFailed: '新建导图失败：{{reason}}',
  // Task 8 编辑器/案头 hooks 报错(打开链/保存链/导出/树移动/案头对话框,调用期 i18n.t)
  readMapFailed: '无法读取文件（可能已被移动或删除）：{{reason}}',
  saveFailed: '保存失败：{{reason}}',
  saveLayoutFailed: '保存布局失败：{{reason}}',
  exportFailed: '导出失败：{{reason}}',
  copyImageFailed: '复制图片失败：{{reason}}',
  moveFailed: '移动失败：{{reason}}',
  importFailed: '导入失败：{{reason}}',
  deleteFailed: '删除失败：{{reason}}',
  deleteDirFailed: '删除目录失败：{{reason}}',
}
