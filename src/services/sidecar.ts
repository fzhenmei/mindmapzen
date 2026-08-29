import type { FsAdapter, LinkAdjustEntry, Sidecar } from '../types/files'

export function sidecarPathOf(mdPath: string): string {
  return mdPath.replace(/\.md$/, '') + '.zen.json'
}

/** 宽容解析 linkAdjust（M5d Task 5）：非对象 → {}；逐条目校验（键任意字符串，值须对象且至少一个
 *  有限数字，非法数字位丢弃）；全非法条目丢弃。旧 sidecar 无该字段按 {} 兼容 */
export function parseLinkAdjust(v: unknown): Record<string, LinkAdjustEntry> {
  if (typeof v !== 'object' || v === null) return {}
  const out: Record<string, LinkAdjustEntry> = {}
  for (const [key, val] of Object.entries(v)) {
    if (typeof val !== 'object' || val === null) continue
    const o = val as Record<string, unknown>
    const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
    const entry: LinkAdjustEntry = { cx1: num(o.cx1), cy1: num(o.cy1), cx2: num(o.cx2), cy2: num(o.cy2) }
    if (entry.cx1 === undefined && entry.cy1 === undefined && entry.cx2 === undefined && entry.cy2 === undefined) {
      continue
    }
    out[key] = entry
  }
  return out
}

export async function readSidecar(fs: FsAdapter, mdPath: string): Promise<Sidecar | null> {
  try {
    const raw = await fs.readTextFile(sidecarPathOf(mdPath))
    const parsed = JSON.parse(raw) as Sidecar
    if (parsed.version !== 1) return null
    return {
      version: 1,
      theme: parsed.theme ?? 'default',
      layout: parsed.layout ?? 'mindmap',
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed : [],
      offsets: parsed.offsets ?? {},
      canvas: parsed.canvas ?? { x: 0, y: 0, zoom: 1 },
      linkAdjust: parseLinkAdjust(parsed.linkAdjust),
    }
  } catch {
    return null
  }
}

export async function writeSidecar(fs: FsAdapter, mdPath: string, sc: Sidecar): Promise<void> {
  await fs.writeTextFileAtomic(sidecarPathOf(mdPath), JSON.stringify(sc, null, 2))
}
