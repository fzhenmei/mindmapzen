import type { FsAdapter } from '../../types/files'

interface Entry { contents: string; modifiedAt: number }

// 与 TauriFsAdapter 同语义的唯一临时名（写 tmp → rename），测试替身须忠实模拟并发防撞行为
let tmpSeq = 0

/** 测试用内存文件系统：目录由路径隐式推导 */
export class MemoryFsAdapter implements FsAdapter {
  private readonly files = new Map<string, Entry>()
  readonly removeLog: string[] = []

  async readTextFile(p: string): Promise<string> {
    const e = this.files.get(p)
    if (!e) throw new Error(`文件不存在：${p}`)
    return e.contents
  }

  async writeTextFileAtomic(p: string, contents: string): Promise<void> {
    const tmp = `${p}.tmp-${++tmpSeq}`
    this.files.set(tmp, { contents, modifiedAt: Date.now() })
    await this.rename(tmp, p)
  }

  async readDir(p: string): Promise<string[]> {
    let base = p
    while (base.endsWith('/')) base = base.slice(0, -1)
    const prefix = base + '/'
    const names = new Set<string>()
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]!)
    }
    return [...names]
  }

  async statModified(p: string): Promise<number> {
    return this.files.get(p)?.modifiedAt ?? 0
  }

  async rename(a: string, b: string): Promise<void> {
    const e = this.files.get(a)
    if (!e) throw new Error(`文件不存在：${a}`)
    this.files.delete(a)
    this.files.set(b, { ...e, modifiedAt: Date.now() })
  }

  async remove(p: string): Promise<void> {
    this.files.delete(p)
    this.removeLog.push(p)
  }

  async exists(p: string): Promise<boolean> {
    return this.files.has(p)
  }

  async ensureDir(): Promise<void> {
    // 内存实现目录由路径隐式推导，无需建目录（接口参数可省略）
  }
}
