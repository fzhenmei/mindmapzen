// 通用动作与名词(全应用共用;后续迁移任务按需增键)
export default {
  ok: '确定',
  cancel: '取消',
  close: '关闭',
  delete: '删除',
  rename: '重命名',
  open: '打开',
  save: '保存',
  // Task 16 兜底:App 启动屏/分区拖拽手柄悬停提示(全应用壳层,无特性域归属)
  booting: '正在启动…',
  resizeTitle: '拖拽调整宽度，双击恢复默认',
  // 旧配置迁移留档标记(migration.ts 写入 appData 的内容型文本,跟随界面语言)
  migrationMarker: '迁移自: {{from}}\n时间: {{time}}',
}
