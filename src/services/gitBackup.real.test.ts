// src/services/gitBackup.real.test.ts —— gitBackup × 真实 git 契约测试。
// 留在默认 jsdom 环境跑（vitest 的 jsdom 跑在 Node 上，node:child_process/fs 可用）；
// 切到纯 node 环境会崩——全局 setup.ts 依赖 window。（注意：本注释不要出现
// vitest 环境切换指令字样，文件头注释内的该指令会被扫描生效。）
// 缘起（2026-09 实案）：gitHistory 的 format 占位符笔误 %x9（合法形态 %x09，两位十六进制），
// git 原样字面输出、前端 split('\t') 切不开 → 整行被当 hash 传入 checkout →
// "fatal: invalid reference: 54fa009%x9…"。桩测试测不出此类问题——桩按"预期 TAB"造数据，
// 与被测代码共享同一错误假设；format 串与真 git 的契约只能用真 git 锁（git 缺失环境 skip）。
import { describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkAndBackup, gitDiffStat, gitHistory } from './gitBackup'
import { cloneWorkspace } from './gitClone'
import type { GitClone, GitRun } from '../types/ports'

/** 真 git 提交身份（机器全局 config 不可依赖——容器/CI 常缺失） */
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'zen-test',
  GIT_AUTHOR_EMAIL: 'zen@test',
  GIT_COMMITTER_NAME: 'zen-test',
  GIT_COMMITTER_EMAIL: 'zen@test',
}

/** 真 git 适配 GitRun：cwd 限定临时仓库；失败时 stdout/stderr 从异常恢复（与 Tauri git_exec 同构） */
const realRun: GitRun = async (cwd, args) => {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV })
    return { ok: true, out, err: '' }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return { ok: false, out: err.stdout ?? '', err: err.stderr ?? '' }
  }
}

/** 真 git 适配 GitClone（与 Tauri git_clone 同构：cwd=父目录，clone <url> <name>） */
const realClone: GitClone = async (parentDir, url, repoName) => {
  try {
    const out = execFileSync('git', ['clone', url, repoName], { cwd: parentDir, encoding: 'utf8', env: GIT_ENV })
    return { ok: true, out, err: '' }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return { ok: false, out: err.stdout ?? '', err: err.stderr ?? '' }
  }
}

/** git 是否可用（不可用环境整体 skip，如裁剪容器） */
const gitAvailable = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!gitAvailable)('gitHistory × 真 git（format 占位符契约）', () => {
  test('%x09 输出真 TAB：hash 为纯短哈希、date/message 字段完整', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zen-git-'))
    try {
      const env = { ...process.env, GIT_AUTHOR_NAME: 'zen-test', GIT_AUTHOR_EMAIL: 'zen@test', GIT_COMMITTER_NAME: 'zen-test', GIT_COMMITTER_EMAIL: 'zen@test' }
      const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'ignore' })
      sh(['init'])
      writeFileSync(join(dir, 'a.md'), 'hello')
      sh(['add', '-A'])
      sh(['commit', '-m', '自动备份 · 1 文件变更'])

      const list = await gitHistory(dir, realRun)
      expect(list).toHaveLength(1)
      // 契约核心：若占位符非法（%x9 形态），hash 会是整行文本而非纯哈希
      expect(list[0]?.hash).toMatch(/^[0-9a-f]{7,40}$/)
      expect(list[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/)
      expect(list[0]?.message).toBe('自动备份 · 1 文件变更')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    // 真子进程 spawn 链偶发撞默认 5s：全量首跑冷缓存 + 满载时 Defender 扫描 Temp 新仓库、
    // git.exe 冷加载可数倍劣化（稳态满载实测 ~1s，单跑必绿故难复现）——同族先例
    // mdTree.roundtrip 0e51fcb，放宽到 30s 解耦时间预算与环境波动
  }, 30_000)

  test('gitDiffStat：unified=0 行级输出 + 恢复视角语义（HEAD→hash，+行=恢复后回来）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zen-git-'))
    try {
      const env = { ...process.env, GIT_AUTHOR_NAME: 'zen-test', GIT_AUTHOR_EMAIL: 'zen@test', GIT_COMMITTER_NAME: 'zen-test', GIT_COMMITTER_EMAIL: 'zen@test' }
      const sh = (args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'ignore' })
      sh(['init'])
      writeFileSync(join(dir, 'a.md'), 'l1\n')
      sh(['add', '-A'])
      sh(['commit', '-m', 'v1'])
      // v2：v1 的 l1 保留，新增 l2/l3 两行 → 恢复到 v1 = 相对当前消失 l2/l3 两行
      writeFileSync(join(dir, 'a.md'), 'l1\nl2\nl3\n')
      sh(['add', '-A'])
      sh(['commit', '-m', 'v2'])
      const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD~1'], { cwd: dir, env, encoding: 'utf8' }).trim()

      const stat = await gitDiffStat(dir, hash, realRun)
      // 契约：参数顺序 HEAD hash 语义 = 恢复后相对当前；del 行 = 恢复后消失的内容
      expect(stat).toEqual({
        files: [
          { path: 'a.md', ins: 0, del: 2, lines: [{ kind: 'del', text: 'l2' }, { kind: 'del', text: 'l3' }] },
        ],
        ins: 0,
        del: 2,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})

describe.skipIf(!gitAvailable)('cloneWorkspace × 真 git（「从 Git 库打开」全链路）', () => {
  // 契约缘起：克隆流的桩测试只能锁「命令序列拼装」，锁不住真 git 行为——
  // 本地路径当 clone 源的合法性、zen-origin 注册后的可推送性、克隆产物形态。
  // 用本地裸库模拟用户场景「本地自建简单 Git Server」（git daemon / HTTP 裸库的同构形态）
  test('裸库克隆 → 产物完整 → zen-origin 指向源 → 自动备份经 zen-origin 推回源', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zen-clone-'))
    try {
      const env = GIT_ENV
      const sh = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'ignore' })
      // 源仓库 A（一段历史）→ 裸库 B =「本地 Git Server」
      const src = join(root, 'src')
      const server = join(root, 'server.git')
      sh(root, ['init', src])
      writeFileSync(join(src, 'a.md'), '# v1\n')
      sh(src, ['add', '-A'])
      sh(src, ['commit', '-m', 'v1'])
      sh(root, ['clone', '--bare', src, server])

      // 克隆到 parent/server（无凭证——本地 server 场景）；r.dir 由服务层 joinPath 拼出（'/' 连接）
      const parent = join(root, 'parent')
      mkdirSync(parent)
      const r = await cloneWorkspace(parent, server, '', '', realClone, realRun)
      expect(r.ok).toBe(true)
      expect(r.dir).toBe(`${parent}/server`)
      expect(existsSync(join(r.dir, 'a.md'))).toBe(true)
      // 仓库级 zen-origin 指向克隆源
      const url = execFileSync('git', ['remote', 'get-url', 'zen-origin'], { cwd: r.dir, env, encoding: 'utf8' }).trim()
      expect(url).toBe(server)

      // 联动闭环：改文件 → 自动备份（全局未配远程）→ 经 zen-origin 推回源
      writeFileSync(join(r.dir, 'a.md'), '# v2\n')
      const outcome = await checkAndBackup(r.dir, { enabled: true, remoteUrl: null, token: null }, realRun)
      expect(outcome.committed).toBe(true)
      expect(outcome.push).toEqual({ kind: 'ok' })
      // 服务端（裸库）收到自动备份提交：历史两条
      const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: server, env, encoding: 'utf8' }).trim()
      expect(count).toBe('2')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30_000)
})
