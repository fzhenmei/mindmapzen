// scripts/appMeta.mjs —— 构建期版本信息（2026-09 关于页/开发版贴纸）：
// 版本号读 package.json、commit 短哈希走系统 git。独立于 vite.config.ts 的原因：
// child_process 调用集中在 scripts/（同 build-release.mjs 的 spawnSync 先例），
// 让 vite.config.ts 不引入 Sonar S4036 警告。execFileSync 参数数组无 shell 介入，
// 命令静态无注入面；取不到 git（浅克隆外/无 git 环境）落 'unknown' 不炸构建。
import { execFileSync } from 'node:child_process'

/** 当前 HEAD 短哈希；git 不可用时 'unknown' */
export function gitShortHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}
