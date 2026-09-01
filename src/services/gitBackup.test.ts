import { describe, expect, test } from 'vitest'
import { checkAndBackup, gitHistory, gitStatusInfo, restoreToVersion, type GitConfig } from './gitBackup'
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

describe('版本历史与回滚（M22）', () => {
  test('gitHistory：制表符分隔解析（新→旧），无仓库空数组', async () => {
    const ok = makeRun([
      { match: 'log -50', ok: true, out: "abc1234\t2026-08-31 10:00:00 +0800\t自动备份 · 3 文件变更\ndef5678\t2026-08-31 09:00:00 +0800\t回滚到 abc1234\n" },
    ])
    const list = await gitHistory('/ws', ok.run)
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({ hash: 'abc1234', date: '2026-08-31 10:00:00 +0800', message: '自动备份 · 3 文件变更' })
    expect(list[1]?.message).toBe('回滚到 abc1234')
    const empty = makeRun([{ match: 'log', ok: false }])
    expect(await gitHistory('/ws', empty.run)).toEqual([])
  })

  test('gitHistory：脏行防御——无分隔符的行（%x9 笔误案的字面输出形态）不产出条目', async () => {
    const dirty = makeRun([
      {
        match: 'log -50',
        ok: true,
        // 真实 git 对非法占位符 %x9 的行为：原样字面输出（无 TAB），split('\t') 切不开 → 整行进 hash
        out: 'abc1234%x92026-08-31 10:00:00 +0800%x9自动备份 · 3 文件变更\n',
      },
    ])
    const list = await gitHistory('/ws', dirty.run)
    expect(list).toEqual([])
  })

  test('restoreToVersion：hash 预检——非哈希形态直接中文报错，不发起任何 git 调用', async () => {
    const ok = makeRun([])
    const err = await restoreToVersion('/ws', 'abc1234%x92026-08-31 10:00:00 +0800%x9自动备份', ok.run)
    expect(err).toContain('版本号无效')
    expect(ok.calls).toHaveLength(0)
  })

  test('restoreToVersion：checkout <hash> -- . + add -A + 回滚提交；无差异也视为成功', async () => {
    const ok = makeRun([{ match: 'checkout', ok: true }, { match: 'commit', ok: true }])
    expect(await restoreToVersion('/ws', 'abc1234', ok.run)).toBeNull()
    expect(ok.calls.some((c) => c.startsWith('checkout abc1234 -- .'))).toBe(true)
    const noDiff = makeRun([
      { match: 'checkout', ok: true },
      { match: 'commit', ok: false, out: 'On branch master\nnothing to commit, working tree clean\n' },
    ])
    expect(await restoreToVersion('/ws', 'abc1234', noDiff.run)).toBeNull()
  })

  test('checkout 失败中文回报', async () => {
    const bad = makeRun([{ match: 'checkout', ok: false, err: 'fatal: bad object' }])
    expect(await restoreToVersion('/ws', 'abc1234', bad.run)).toContain('恢复失败')
  })
})
