// 手机点子捕获词条(spec 2026-09-26 mobile-capture §5.1/§5.4):设置分区文案 + Rust 侧收到点子后整批入篮的提示
export default {
  title: '手机同步',
  toggle: '允许手机通过局域网同步点子',
  port: '端口',
  hint: '开启后同一局域网内的手机扫码即可配对;点子会直接进点子篮子',
  qrcodeHint: 'App 扫码配对:手机端点「扫码配对」扫此码',
  ipSelect: '本机地址',
  startFailed: '服务启动失败(端口被占用?)',
  received: '收到 {{n}} 条来自手机的点子',
}
