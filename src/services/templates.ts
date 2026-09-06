// src/services/templates.ts —— 模板清单服务（M16）：内置注册表 + 工作区 templates/ 目录扫描
import type { FsAdapter } from '../types/files'
import { i18n } from '../i18n'
import { sortLocale } from '../i18n/resolve'
import { builtinTemplates } from '../templates/registry'
import { joinPath } from './workspace'

/** 模板条目：key 为选择器值（builtin:<id> / user:<relPath>） */
export interface TemplateInfo {
  key: string
  name: string
  /** 一句用途说明（内置有；用户模板留空） */
  desc: string
  source: 'builtin' | 'user'
  /** 模板 md 全文（确认时由 createMap 实例化：根名替换为用户输入名） */
  content: string
}

/** 模板目录名（工作区下）：目录本身不隐藏——编辑模板=编辑普通导图 */
export const TEMPLATES_DIR = 'templates'

/** 模板清单 = 内置注册表 + 工作区 templates/ 下的 .md（递归；按名称序排在内置后）。
 *  无工作区或目录不存在 → 仅内置。读取失败的单个模板跳过（不阻断清单） */
export async function listTemplates(fs: FsAdapter, wsDir: string | null): Promise<TemplateInfo[]> {
  const builtin: TemplateInfo[] = builtinTemplates().map((t) => ({
    key: `builtin:${t.id}`,
    name: t.name,
    desc: t.desc,
    source: 'builtin',
    content: t.content,
  }))
  if (!wsDir) return builtin
  const dir = joinPath(wsDir, TEMPLATES_DIR)
  const names = await collectMdNames(fs, dir, '')
  const user: Array<TemplateInfo | null> = await Promise.all(
    names.map(async ({ relPath, fileName }): Promise<TemplateInfo | null> => {
      try {
        const content = await fs.readTextFile(joinPath(dir, relPath === '' ? fileName : `${relPath}/${fileName}`))
        return {
          key: `user:${relPath === '' ? '' : relPath + '/'}${fileName.replace(/\.md$/, '')}`,
          name: fileName.replace(/\.md$/, ''),
          desc: relPath === '' ? i18n.t('library.templates.workspace') : i18n.t('library.templates.workspaceIn', { dir: relPath }),
          source: 'user',
          content,
        }
      } catch {
        return null // 单个模板读取失败跳过
      }
    }),
  )
  const clean = user.filter((t): t is TemplateInfo => t !== null).sort((a, b) => a.name.localeCompare(b.name, sortLocale(i18n.language === 'en' ? 'en' : 'zh-CN')))
  return [...builtin, ...clean]
}

/** 递归收集目录下 .md 文件名（含相对目录段） */
async function collectMdNames(
  fs: FsAdapter,
  dir: string,
  relPath: string,
): Promise<Array<{ relPath: string; fileName: string }>> {
  let entries
  try {
    entries = await fs.readDirEntries(dir)
  } catch {
    return [] // 目录不存在
  }
  const out: Array<{ relPath: string; fileName: string }> = []
  for (const e of entries) {
    if (e.isDir) {
      out.push(...(await collectMdNames(fs, joinPath(dir, e.name), relPath === '' ? e.name : `${relPath}/${e.name}`)))
    } else if (e.name.endsWith('.md')) {
      out.push({ relPath, fileName: e.name })
    }
  }
  return out
}
