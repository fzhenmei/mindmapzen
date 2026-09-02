// src/services/gitBackup.ts —— 工作区 git 自动备份（M20 想法8：免命令 + 远程备份）
// 实现：系统 git CLI（经 GitRun 端口，生产 Tauri command，测试/E2E 记录桩）——
// 与 isomorphic-git 方案的取舍见台账（fs 原语适配面大）。行为：幂等 checkAndBackup——
// 仓库不存在则 init；无变更 no-op（不产空提交）；有变更 add -A + commit（自动消息）；
// 配了 remoteUrl 则确保 remote 指向并 push（失败不阻断，状态回报）。
import type { GitRun } from '../types/ports'
import type { GitConfig } from '../types/files'

/** 版本管理配置 = types/files.GitConfig（AppConfig.git，宽容解析见 config.ts） */
export type { GitConfig } from '../types/files'

export interface BackupOutcome {
  /** 本次是否产生了新提交 */
  committed: boolean
  /** 提交消息（committed 时有值） */
  message?: string
  /** push 结果：ok=成功 / skipped=未配远程或无提交 / 错误消息（中文，状态栏用） */
  push: { kind: 'ok' } | { kind: 'skipped'; reason: string } | { kind: 'error'; message: string }
  /** 执行中遇到的致命错误（如 git 不存在）；null = 流程走完 */
  fatal: string | null
}

/** token 内嵌 HTTPS URL（git 推送认证惯例：x-access-token:<PAT>@）；无 token 原样 */
function remoteWithToken(url: string, token: string | null): string {
  if (token === null || token === '' || !url.startsWith('https://')) return url
  return `https://x-access-token:${encodeURIComponent(token)}@${url.slice('https://'.length)}`
}

const REMOTE_NAME = 'zen-origin'

/** 幂等检查并备份：init（按需）→ 无变更 no-op → add -A + commit → push（按需） */
export async function checkAndBackup(
  wsDir: string,
  cfg: GitConfig,
  run: GitRun,
): Promise<BackupOutcome> {
  // git 可用性与仓库探测：rev-parse 失败且 init 也失败（如未装 git）→ fatal
  const probe = await run(wsDir, ['rev-parse', '--git-dir'])
  if (!probe.ok) {
    const init = await run(wsDir, ['init'])
    if (!init.ok) return { committed: false, push: { kind: 'skipped', reason: '未初始化' }, fatal: `git init 失败：${init.err.split('\n')[0]}` }
  }
  // 变更探测（porcelain 每行一个变更）
  const status = await run(wsDir, ['status', '--porcelain'])
  if (!status.ok) return { committed: false, push: { kind: 'skipped', reason: '状态不可读' }, fatal: `git status 失败：${status.err.split('\n')[0]}` }
  const changed = status.out.split('\n').filter((l) => l.trim() !== '').length
  if (changed === 0) return { committed: false, push: { kind: 'skipped', reason: '无变更' }, fatal: null }

  const stamp = new Date().toLocaleString('zh-CN')
  const message = `自动备份 · ${stamp} · ${changed} 文件变更`
  await run(wsDir, ['add', '-A'])
  const commit = await run(wsDir, ['commit', '-m', message])
  if (!commit.ok) {
    return { committed: false, push: { kind: 'skipped', reason: '提交失败' }, fatal: `git commit 失败：${commit.err.split('\n')[0]}` }
  }

  // 远程推送（可选）：确保 zen-origin 指向配置 URL，再推送当前分支
  if (cfg.remoteUrl === null || cfg.remoteUrl === '') {
    return { committed: true, message, push: { kind: 'skipped', reason: '未配置远程' }, fatal: null }
  }
  const url = remoteWithToken(cfg.remoteUrl, cfg.token)
  const current = await run(wsDir, ['remote', 'get-url', REMOTE_NAME])
  if (current.ok && current.out.trim() !== url) {
    await run(wsDir, ['remote', 'set-url', REMOTE_NAME, url])
  } else if (!current.ok) {
    await run(wsDir, ['remote', 'add', REMOTE_NAME, url])
  }
  const push = await run(wsDir, ['push', '-u', REMOTE_NAME, 'HEAD'])
  if (!push.ok) {
    const err = push.err.split('\n').filter((l) => l.trim() !== '').slice(-2).join(' ')
    return { committed: true, message, push: { kind: 'error', message: err } , fatal: null }
  }
  return { committed: true, message, push: { kind: 'ok' }, fatal: null }
}

export interface GitStatusInfo {
  /** 最近提交摘要（时间 + 消息首行）；无仓库/无提交为 null */
  lastCommit: string | null
  /** 未推送提交数（status -sb ahead 计数）；不可得为 null */
  aheadCount: number | null
}

/** 状态查询（设置页显示用） */
export async function gitStatusInfo(wsDir: string, run: GitRun): Promise<GitStatusInfo> {
  const log = await run(wsDir, ['log', '-1', '--format=%ci %s'])
  if (!log.ok) return { lastCommit: null, aheadCount: null }
  const sb = await run(wsDir, ['status', '-sb'])
  const m = /ahead (\d+)/.exec(sb.out)
  return { lastCommit: log.out.trim(), aheadCount: m !== null ? Number(m[1]) : 0 }
}

export interface HistoryEntry {
  /** 短哈希 */
  hash: string
  /** 提交时间（原始 %ci 格式） */
  date: string
  /** 提交消息首行 */
  message: string
}

/** 版本历史（M22 回滚 UI）：最近 limit 条提交（新→旧）；无仓库/无提交返回空数组。
 *  分隔符占位符必须是 %x09（%x 后**两位**十六进制）——%x9 是笔误形态，git 会
 *  原样字面输出，split('\t') 切不开 → 整行被当 hash（2026-09 invalid reference 实案） */
export async function gitHistory(wsDir: string, run: GitRun, limit = 50): Promise<HistoryEntry[]> {
  const log = await run(wsDir, ['log', `-${limit}`, '--format=%h%x09%ci%x09%s'])
  if (!log.ok) return []
  return log.out
    .split('\n')
    .filter((l) => l.trim() !== '')
    .flatMap((l) => {
      const [hash = '', date = '', ...msg] = l.split('\t')
      // 脏行防御：分隔符缺失（如字面 %x9 输出）时整行落进 hash——非哈希形态直接丢弃
      return HASH_RE.test(hash) ? [{ hash, date, message: msg.join('\t') }] : []
    })
}

/** 哈希形态：短哈希 7 位起（core.abbrev 可加长），最长完整 40 位 */
const HASH_RE = /^[0-9a-f]{7,40}$/

/** 恢复预览的单条变更行（M23b）：add=恢复后回来的行，del=恢复后消失的行 */
export interface DiffLine {
  kind: 'add' | 'del'
  text: string
}

/** 恢复预览的文件级差异（M23b 行级）：ins/del 为行计数，lines 为变更行内容 */
export interface DiffFile {
  path: string
  ins: number
  del: number
  /** 变更行（unified=0 无上下文）；二进制等无行级 diff 的文件为空 */
  lines: DiffLine[]
}

/** 恢复预览（M23 盲盒问题）：hash 与 HEAD 的**行级**差异——
 *  git diff --unified=0 HEAD <hash>（零上下文，只出变更行），输出视角即
 *  "当前 → 该版本"：- 行=恢复后消失的内容，+ 行=恢复后回来的内容。
 *  返回 null = 命令失败或非法 hash；files 空 = 与当前无差异（恢复无效果） */
export async function gitDiffStat(
  wsDir: string,
  hash: string,
  run: GitRun,
): Promise<{ files: DiffFile[]; ins: number; del: number } | null> {
  if (!HASH_RE.test(hash)) return null
  const diff = await run(wsDir, ['diff', '--unified=0', 'HEAD', hash])
  if (!diff.ok) return null
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  let aPath = ''
  for (const l of diff.out.split('\n')) {
    if (l.startsWith('+++ ')) {
      // b/ 前缀后可含空格，故整体截取；/dev/null = 文件被删，路径取 --- a/ 侧
      if (cur !== null && cur.path !== '') files.push(cur)
      const b = l.slice(4)
      cur = { path: b === '/dev/null' ? aPath.replace(/^a\//, '') : b.replace(/^b\//, ''), ins: 0, del: 0, lines: [] }
    } else if (l.startsWith('--- ')) {
      aPath = l.slice(4)
    } else if (cur !== null && (l.startsWith('+') || l.startsWith('-'))) {
      const kind: DiffLine['kind'] = l[0] === '+' ? 'add' : 'del'
      cur.lines.push({ kind, text: l.slice(1) })
      if (kind === 'add') cur.ins += 1
      else cur.del += 1
    }
    // diff --git / index / @@ 头、\ No newline、空行：不产出内容
  }
  if (cur !== null && cur.path !== '') files.push(cur)
  return {
    files,
    ins: files.reduce((s, f) => s + f.ins, 0),
    del: files.reduce((s, f) => s + f.del, 0),
  }
}

/** 恢复到指定版本（M22）：工作区文件整体回到该提交内容，**以新提交落盘**——
 *  历史只增不改（git checkout <hash> -- . 后自动 commit），回滚本身可再回滚；
 *  工作区若有未提交变更一并被覆盖（入口在案头设置页，编辑器内无在途内容）。
 *  返回 null=成功，否则中文错误 */
export async function restoreToVersion(
  wsDir: string,
  hash: string,
  run: GitRun,
): Promise<string | null> {
  // 预检：非哈希形态直接拒绝（防脏数据把整行文本带进 checkout 报 git 原始错误）
  if (!HASH_RE.test(hash)) return `版本号无效：${hash.slice(0, 20)}…`
  const checkout = await run(wsDir, ['checkout', hash, '--', '.'])
  if (!checkout.ok) return `恢复失败：${checkout.err.split('\n')[0] ?? ''}`
  // 变更落为新提交（无变更时 commit 失败=无差异，视为成功）
  await run(wsDir, ['add', '-A'])
  const stamp = new Date().toLocaleString('zh-CN')
  const commit = await run(wsDir, ['commit', '-m', `回滚到 ${hash} · ${stamp}`])
  if (!commit.ok && !/nothing to commit|无|no changes/i.test(commit.out + commit.err)) {
    return `提交回滚失败：${commit.err.split('\n')[0] ?? ''}`
  }
  return null
}
