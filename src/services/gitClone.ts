// src/services/gitClone.ts —— 「从 Git 库打开」：clone URL → 克隆到本地父目录 → 注册仓库级
// zen-origin（指向克隆源同 URL）。设计取向：不做任何厂商集成（GitLab/GitHub 专属 API 一概
// 不碰），纯 git clone 语义对任意 Git Server 通用——本地自建简单 Server（git daemon / HTTP
// 裸库 / file 路径）与公网托管一视同仁。认证走 URL 内嵌 basic auth（http(s) 限定，git CLI
// 惯例），凭证不落任何应用配置，仅存于该仓库 .git/config（git remote 的常规行为）。
// 克隆成功后全局备份远程未配置时，自动备份经 zen-origin 推回克隆源（见 gitBackup 回退探测）
import type { GitClone, GitRun } from '../types/ports'
import { i18n } from '../i18n'
import { joinPath } from './workspace'

/** 与备份推送共用的 remote 名（gitBackup 侧定义单一来源） */
import { REMOTE_NAME } from './gitBackup'

/** 用户名/密码内嵌进 http(s) URL（basic auth 惯例 user:pass@）；非 http(s) 原样返回
 *  （ssh 走密钥、git/file 协议无 basic auth 概念）。encodeURIComponent 防特殊字符破 URL */
export function embedCredentials(url: string, username: string, password: string): string {
  const m = /^(https?:\/\/)(.*)$/.exec(url)
  if (m === null) return url
  return `${m[1]}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${m[2]}`
}

/** 从 clone URL 提取仓库名：去首尾空白与尾斜杠 → 去 .git 后缀 → 末段（/ 与 \ 都切，
 *  兼容本地 Windows 路径直接当克隆源）。scp-like（git@host:repo）与端口/盘符的 ':' 归一为
 *  '/'（冒号是 Windows 目录非法字符）；http(s) 仅主机无路径形态返回 ''（调用方词典化报错） */
export function repoNameFromUrl(url: string): string {
  let u = url.trim()
  // '://'（scheme 后）不动，其余 ':' 换 '/'：git@host:repo → git@host/repo、:8080 → /8080、D:\x → D/x
  u = u.replace(/:(?!\/)/g, '/')
  while (u.endsWith('/') || u.endsWith('\\')) u = u.slice(0, -1)
  if (u.toLowerCase().endsWith('.git')) u = u.slice(0, -4)
  // http(s) 无路径（仅主机）：主机名不是仓库名
  if (/^https?:\/\/[^/]+$/.test(u)) return ''
  return (u.split(/[\\/]/).pop() ?? '').trim()
}

/** 克隆结果（判别联合）：ok=true 时 error 恒 null、ok=false 时 error 恒有值——
 *  调用方 `if (!r.ok) throw new Error(r.error)` 免空值宽减 */
export type CloneOutcome =
  | { ok: true; dir: string; error: null }
  /** dir = 半成品位置（校验阶段未触 git 时为 ''），供调用方回收 */
  | { ok: false; dir: string; error: string }

/** 校验 + 克隆 + 注册 zen-origin。校验：URL 非空、仓库名可解析、用户名与密码成对
 *  （只填其一必是手误——basic auth 缺一不可）。克隆失败取 stderr 末行（clone 的
 *  stderr 首行是 "Cloning into 'x'..." 状态行，真正的 fatal 在末行） */
export async function cloneWorkspace(
  parentDir: string,
  url: string,
  username: string,
  password: string,
  clone: GitClone,
  run: GitRun,
): Promise<CloneOutcome> {
  const u = url.trim()
  if (u === '') return { ok: false, dir: '', error: i18n.t('errors.git.clone.urlEmpty') }
  const name = repoNameFromUrl(u)
  if (name === '') return { ok: false, dir: '', error: i18n.t('errors.git.clone.nameUnparsable') }
  const hasUser = username.trim() !== ''
  if (hasUser !== (password !== '')) {
    return { ok: false, dir: '', error: i18n.t('errors.git.clone.credsPair') }
  }
  const cloneUrl = hasUser ? embedCredentials(u, username.trim(), password) : u
  const dir = joinPath(parentDir, name)
  const r = await clone(parentDir, cloneUrl, name)
  if (!r.ok) {
    // filter 与 .at 拆开两步：链式 filter().at() 会撞 S7750（建议 findLast，而 findLast
    // 超出 tsconfig lib 不编译）——两步写法两条规则都过
    const lines = r.err.split('\n').filter((l) => l.trim() !== '')
    const detail = lines.at(-1) ?? ''
    return { ok: false, dir, error: i18n.t('errors.git.clone.fail', { detail }) }
  }
  // 仓库级 zen-origin 指向克隆源：自动备份「推回源」能力的锚点（全局备份远程未配置时
  // gitBackup 回退探测它）。注册失败仅退化成「不推回」，不阻断打开——留痕即可
  const reg = await run(dir, ['remote', 'add', REMOTE_NAME, cloneUrl])
  if (!reg.ok) {
    // 可安全忽略：zen-origin 非克隆主链路，缺失只影响后续推送回源（届时 push 报错可见）
    console.warn(`zen-origin 注册失败（不影响克隆打开）: ${reg.err.split('\n')[0] ?? ''}`)
  }
  return { ok: true, dir, error: null }
}
