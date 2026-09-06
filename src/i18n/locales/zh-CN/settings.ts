// 设置域:设置面板 + 历史/冲突/快速切换/关闭守卫等对话框(后续任务并入)
export default {
  title: '设置',
  language: { label: '语言', auto: '跟随系统', zh: '简体中文', en: 'English' },
  git: {
    toggle: '版本管理（自动提交到工作区 git 仓库）',
    remotePlaceholder: '远程仓库 HTTPS 地址（留空仅本地提交）',
    tokenPlaceholder: '访问令牌（PAT，私有仓库需要）',
    noCommit: '尚无提交',
    lastCommit: '最近提交：{{commit}}',
    ahead: ' · 未推送 {{count}}',
    history: '历史',
    backupNow: '立即备份',
  },
  tourReplay: '功能引导',
  tourReplayBtn: '重新观看',
  workspaceRow: '工作区：{{dir}}',
  workspaceUnset: '未设置',
  changeWorkspace: '更换工作区',
  exitWorkspace: '退出工作区（回到开屏）',
  exitBtn: '退出',
  close: '关闭',
}
