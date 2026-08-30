import { describe, expect, test } from 'vitest'
import { checkAndBackup, gitStatusInfo, type GitConfig } from './gitBackup'
import type { GitRun } from '../types/ports'

/** 记录型桩：按命令模式回放预设应答（args.join(' ') 前缀匹配） */
function makeRun(
  answers: Array<{ match: string; ok: boolean; out?: string; err?: string }>,
): { run: GitRun; calls: string[] } {
  const calls: string[] = []
  const run: GitRun = async (_cwd, args) => {
    const cmd = args.join(' ')
    calls.push(cmd)
    const hit = answers.find((a) => cmd.startsWith(a.match))
    if (hit === undefined) return { ok: true, out: '', err: '' }
    return { ok: hit.ok, out: hit.out ?? '', err: hit.err ?? '' }
  }
  return { run, calls }
}

const CFG = (over: Partial<GitConfig> = {}): GitConfig => ({
  enabled: true,
  remoteUrl: null,
  token: null,
  ...over,
})

describe('checkAndBackup（M20 免命令自动备份）', () => {
  test('无仓库先 init；无变更 no-op（不 add/commit）', async () => {
    const { run, calls } = makeRun([
      { match: 'rev-parse', ok: false },
      { match: 'init', ok: true },
      { match: 'status --porcelain', ok: true, out: '' },
    ])
    const r = await checkAndBackup('/ws', CFG(), run)
    expect(r.committed).toBe(false)
    expect(r.push.kind).toBe('skipped')
    expect(r.fatal).toBeNull()
    expect(calls).toContain('init')
    expect(calls.some((c) => c.startsWith('commit'))).toBe(false)
  })

  test('有变更：add -A + commit（自动消息含变更数）；未配远程 skipped', async () => {
    const { run, calls } = makeRun([
      { match: 'rev-parse', ok: true },
      { match: 'status --porcelain', ok: true, out: 'M a.md\n?? b.md\n' },
      { match: 'add', ok: true },
      { match: 'commit', ok: true },
    ])
    const r = await checkAndBackup('/ws', CFG(), run)
    expect(r.committed).toBe(true)
    expect(r.message).toContain('2 文件变更')
    expect(r.push).toEqual({ kind: 'skipped', reason: '未配置远程' })
    expect(calls.some((c) => c.startsWith('add -A'))).toBe(true)
    expect(calls.some((c) => c.startsWith('commit -m'))).toBe(true)
  })

  test('配远程：确保 zen-origin 指向（set-url 覆盖旧值）并 push HEAD', async () => {
    const { run, calls } = makeRun([
      { match: 'rev-parse', ok: true },
      { match: 'status --porcelain', ok: true, out: 'M a.md' },
      { match: 'remote get-url', ok: true, out: 'https://old@x/repo.git\n' },
      { match: 'push', ok: true },
    ])
    const r = await checkAndBackup('/ws', CFG({ remoteUrl: 'https://github.com/u/r.git', token: 'PAT' }), run)
    expect(r.push).toEqual({ kind: 'ok' })
    expect(calls).toContain('remote set-url zen-origin https://x-access-token:PAT@github.com/u/r.git')
    expect(calls.some((c) => c.startsWith('push -u zen-origin HEAD'))).toBe(true)
  })

  test('push 失败不阻断：committed 仍 true，错误消息回报', async () => {
    const { run } = makeRun([
      { match: 'rev-parse', ok: true },
      { match: 'status --porcelain', ok: true, out: 'M a.md' },
      { match: 'remote get-url', ok: false },
      { match: 'push', ok: false, err: "error: failed to push\nfatal: Authentication failed" },
    ])
    const r = await checkAndBackup('/ws', CFG({ remoteUrl: 'https://x/r.git' }), run)
    expect(r.committed).toBe(true)
    expect(r.push.kind).toBe('error')
    if (r.push.kind === 'error') expect(r.push.message).toContain('Authentication failed')
    expect(r.fatal).toBeNull()
  })

  test('git 不可用（init 失败）：fatal 中文回报', async () => {
    const { run } = makeRun([
      { match: 'rev-parse', ok: false },
      { match: 'init', ok: false, err: 'program not found' },
    ])
    const r = await checkAndBackup('/ws', CFG(), run)
    expect(r.fatal).toContain('git init 失败')
  })
})

describe('gitStatusInfo', () => {
  test('最近提交与 ahead 计数；无仓库为 null', async () => {
    const ok = makeRun([
      { match: 'log -1', ok: true, out: '2026-08-30 16:00:00 +0800 自动备份 · x\n' },
      { match: 'status -sb', ok: true, out: '## master...origin/master [ahead 2]\n' },
    ])
    expect(await gitStatusInfo('/ws', ok.run)).toEqual({
      lastCommit: '2026-08-30 16:00:00 +0800 自动备份 · x',
      aheadCount: 2,
    })
    const empty = makeRun([{ match: 'log', ok: false }])
    expect(await gitStatusInfo('/ws', empty.run)).toEqual({ lastCommit: null, aheadCount: null })
  })
})
