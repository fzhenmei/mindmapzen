import { describe, expect, test, vi } from 'vitest'
import { cloneWorkspace, embedCredentials, repoNameFromUrl } from './gitClone'
import type { GitClone, GitRun } from '../types/ports'

/** 记录型桩（与 gitBackup.test 的 makeRun 同构）：按前缀匹配回放应答，未命中恒成功 */
function makePorts(
  cloneAnswer: { ok: boolean; out?: string; err?: string },
  remoteAddOk = true,
): { clone: GitClone; run: GitRun; cloneCalls: string[]; runCalls: string[] } {
  const cloneCalls: string[] = []
  const runCalls: string[] = []
  const clone: GitClone = async (parentDir, url, repoName) => {
    cloneCalls.push(`${parentDir} $ clone ${url} ${repoName}`)
    return { ok: cloneAnswer.ok, out: cloneAnswer.out ?? '', err: cloneAnswer.err ?? '' }
  }
  const run: GitRun = async (_cwd, args) => {
    const cmd = args.join(' ')
    runCalls.push(cmd)
    return cmd.startsWith('remote add') && !remoteAddOk
      ? { ok: false, out: '', err: "error: remote zen-origin already exists." }
      : { ok: true, out: '', err: '' }
  }
  return { clone, run, cloneCalls, runCalls }
}

describe('embedCredentials（URL 内嵌 basic auth）', () => {
  test('https/http 内嵌并 encodeURIComponent；非 http(s) 原样', () => {
    expect(embedCredentials('https://git.local/repo.git', 'user', 'pass')).toBe('https://user:pass@git.local/repo.git')
    expect(embedCredentials('http://git.local/repo.git', 'user', 'p@ss:w')).toBe('http://user:p%40ss%3Aw@git.local/repo.git')
    // ssh / 本地路径 / git 协议无 basic auth 概念，原样返回
    expect(embedCredentials('git@git.local:repo.git', 'user', 'pass')).toBe('git@git.local:repo.git')
    expect(embedCredentials('file:///srv/git/repo.git', 'user', 'pass')).toBe('file:///srv/git/repo.git')
  })
})

describe('repoNameFromUrl（仓库名提取）', () => {
  test.each([
    ['https://git.local/scm/repo.git', 'repo'],
    ['https://git.local/scm/repo', 'repo'],
    ['https://git.local/scm/repo.git/', 'repo'],
    ['git@git.local:scm/repo.git', 'repo'],
    ['file:///srv/git/repo.git', 'repo'],
    ['D:\\srv\\git\\repo.git', 'repo'],
    ['  https://git.local/repo.git  ', 'repo'],
    // 提取不出非空段：仅协议/主机形态与裸斜杠
    ['https://git.local', ''],
    ['///', ''],
  ])('%s → %s', (url, want) => {
    expect(repoNameFromUrl(url)).toBe(want)
  })
})

describe('cloneWorkspace（校验 + 克隆 + 注册 zen-origin）', () => {
  test('成功（无凭证）：clone 实参为裸 URL，注册 zen-origin 同 URL，返回目标目录', async () => {
    const p = makePorts({ ok: true })
    const r = await cloneWorkspace('/parent', 'https://git.local/scm/repo.git', '', '', p.clone, p.run)
    expect(r).toEqual({ ok: true, dir: '/parent/repo', error: null })
    expect(p.cloneCalls).toEqual(['/parent $ clone https://git.local/scm/repo.git repo'])
    expect(p.runCalls).toEqual(['remote add zen-origin https://git.local/scm/repo.git'])
  })

  test('成功（带凭证）：clone 与 zen-origin 收到的都是内嵌 URL', async () => {
    const p = makePorts({ ok: true })
    const r = await cloneWorkspace('/parent', 'https://git.local/repo.git', 'user', 'p@ss', p.clone, p.run)
    expect(r.ok).toBe(true)
    expect(p.cloneCalls).toEqual(['/parent $ clone https://user:p%40ss@git.local/repo.git repo'])
    expect(p.runCalls).toEqual(['remote add zen-origin https://user:p%40ss@git.local/repo.git'])
  })

  test('校验：空地址 / 解析不出仓库名 / 凭证不成对——词典化报错且不触 git', async () => {
    const p = makePorts({ ok: true })
    expect((await cloneWorkspace('/parent', '  ', '', '', p.clone, p.run)).error).toBe('请输入 Git 库地址')
    expect((await cloneWorkspace('/parent', 'https://git.local', '', '', p.clone, p.run)).error).toBe('无法从地址解析出仓库名')
    expect((await cloneWorkspace('/parent', 'https://git.local/repo.git', 'user', '', p.clone, p.run)).error).toBe('用户名与密码/Token 需成对填写')
    expect((await cloneWorkspace('/parent', 'https://git.local/repo.git', '', 'pass', p.clone, p.run)).error).toBe('用户名与密码/Token 需成对填写')
    expect(p.cloneCalls).toHaveLength(0)
  })

  test('克隆失败：错误取 stderr 末行（首行是 Cloning into 状态行），dir 仍回传供回收', async () => {
    const p = makePorts({ ok: false, err: "Cloning into 'repo'...\nfatal: unable to access 'https://git.local/repo.git/'" })
    const r = await cloneWorkspace('/parent', 'https://git.local/repo.git', '', '', p.clone, p.run)
    expect(r).toEqual({ ok: false, dir: '/parent/repo', error: "克隆失败：fatal: unable to access 'https://git.local/repo.git/'" })
    expect(p.runCalls).toHaveLength(0)
  })

  test('zen-origin 注册失败不阻断：仍 ok，console.warn 留痕', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const p = makePorts({ ok: true }, false)
      const r = await cloneWorkspace('/parent', 'https://git.local/repo.git', '', '', p.clone, p.run)
      expect(r.ok).toBe(true)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})
