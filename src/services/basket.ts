// src/services/basket.ts —— 点子篮子约定与文件层读写（spec §3）：篮子 = 工作区根下普通导图，
// 根的直接子节点即点子（text 单行 + 可选 body）。文件身份由 cfg.basketPath 锚定，
// 默认名按首次创建语言生成后固定（不随 i18n 漂移）
import type { FsAdapter } from '../types/files'
import type { UiLocale } from '../i18n/resolve'
import type { EngineNode } from '../types/engine'
import type { ZenNode } from '../types/tree'
import { parse } from './mdTree'

export interface BasketIdea {
  text: string
  body?: string
}

/** 篮子默认名（首次创建时按界面语言取，创建即固定） */
export function defaultBasketName(lang: UiLocale): string {
  return lang === 'en' ? 'Idea Inbox' : '点子篮子'
}

/** cfg.basketPath 为空时按语言生成默认相对路径（'/' 分隔，与 MapInfo.relDir 同口径） */
export function resolveBasketRelPath(cfgPath: string | null, lang: UiLocale): string {
  return cfgPath ?? `${defaultBasketName(lang)}.md`
}

export function basketAbsPath(wsDir: string, relPath: string): string {
  return `${wsDir}/${relPath}`
}

/** 读图并 parse（目标选择器大纲/篮子文件层读取共用）；失败返回 null + console 线索（显式出口） */
export async function readMapTree(fs: FsAdapter, mdPath: string): Promise<ZenNode | null> {
  try {
    const r = parse(await fs.readTextFile(mdPath))
    if (!r.ok) {
      console.error('篮子：导图解析失败', mdPath, r.error)
      return null
    }
    return r.tree
  } catch (e) {
    console.error('篮子：导图读取失败', mdPath, e)
    return null
  }
}

/** 篮子不存在则按默认名创建（丢失重建语义，spec §3.3）；已存在不动 */
export async function ensureBasket(fs: FsAdapter, wsDir: string, relPath: string, rootText: string): Promise<void> {
  const abs = basketAbsPath(wsDir, relPath)
  if (await fs.exists(abs)) return
  await fs.writeTextFileAtomic(abs, `# ${rootText}\n`)
}

/** 文件层读篮子点子；篮子文件不存在返回 null（调用方决定重建或提示） */
export async function readBasketIdeas(fs: FsAdapter, wsDir: string, relPath: string): Promise<BasketIdea[] | null> {
  const tree = await readMapTree(fs, basketAbsPath(wsDir, relPath))
  return tree === null ? null : parseBasketIdeas(tree)
}

/** 根的直接子节点 → 点子列表 */
export function parseBasketIdeas(tree: ZenNode): BasketIdea[] {
  return tree.children.map((c) => ({ text: c.text, ...(c.body !== undefined && c.body !== '' ? { body: c.body } : {}) }))
}

/** 引擎 renderTree 形态同口径（data.text / data.body） */
export function parseBasketIdeasFromEngine(root: EngineNode): BasketIdea[] {
  const children = (root as { nodeData?: { children?: EngineNode[] } }).nodeData?.children ?? []
  return children.map((c) => {
    const d = (c as { data?: { text?: string; body?: string } }).data
    const text = typeof d?.text === 'string' ? d.text : ''
    return { text, ...(typeof d?.body === 'string' && d.body !== '' ? { body: d.body } : {}) }
  })
}

/** 插入点子为根下首位（不可变）：新点子在收件箱最上（spec §3.2） */
export function insertIdeaIntoTree(tree: ZenNode, idea: BasketIdea): ZenNode {
  const ideaNode: ZenNode = { text: idea.text, children: [], ...(idea.body !== undefined ? { body: idea.body } : {}) }
  return { ...tree, children: [ideaNode, ...tree.children] }
}
