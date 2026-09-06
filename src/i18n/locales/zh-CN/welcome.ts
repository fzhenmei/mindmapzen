// 案头欢迎页(v2.5 纵轴轮):时段问候/时间相对词/空态/页脚寄语
// 空态实际为单句,brief 的 emptyTitle/emptyBody 合一为 emptyHint(键名从 library 先例);zh 值与旧渲染逐字一致
export default {
  greetingNight: '夜深了',
  greetingMorning: '早上好',
  greetingAfternoon: '下午好',
  greetingEvening: '晚上好',
  today: '今天',
  yesterday: '昨天',
  recentTitle: '最近的',
  emptyHint: '还没有打开过的导图，从上面新建一张吧',
  footer: '踏上取经路比到达灵山更重要',
  // Task 16 兜底:品牌头问候后缀与「开始」双按钮(「导入」无语义等值键,不复用 library)
  greetingSuffix: '—— 想法落成 .md',
  newMap: '新建导图',
  importMap: '导入',
}
