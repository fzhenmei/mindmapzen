import type { FsAdapter, Sidecar } from '../types/files'

export function sidecarPathOf(mdPath: string): string {
  return mdPath.replace(/\.md$/, '') + '.zen.json'
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
    }
  } catch {
    return null
  }
}

export async function writeSidecar(fs: FsAdapter, mdPath: string, sc: Sidecar): Promise<void> {
  await fs.writeTextFileAtomic(sidecarPathOf(mdPath), JSON.stringify(sc, null, 2))
}
