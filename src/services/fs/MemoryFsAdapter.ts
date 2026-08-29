import type { DirEntryInfo, FsAdapter } from '../../types/files'

interface Entry { contents: string; modifiedAt: number }

// 与 TauriFsAdapter 同语义的唯一临时名（写 tmp → rename），测试替身须忠实模拟并发防撞行为
let tmpSeq = 0

/** 测试用内存文件系统：文件目录隐式推导 + 显式 mkdir/ensureDir 记录的目录集合 */
export class MemoryFsAdapter implements FsAdapter {
  private readonly files = new Map<string, Entry>()
  /** 显式建立的目录（mkdir/ensureDir 记入，含父链）；readDirEntries 输出 = 该集合 ∪ 文件路径推导的首段 */
  private readonly dirs = new Set<string>()
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

  async ensureDir(p?: string): Promise<void> {
    // 内存实现无真实建目录动作，仅记入显式目录集合（含父链）；接口参数可选兼容旧无参调用
    if (p !== undefined) this.recordDirChain(p)
  }

  async mkdir(p: string): Promise<void> {
    // 幂等：Set 记入天然幂等；父链一并记入（对齐 Tauri 递归 mkdir 的真实语义）
    this.recordDirChain(p)
  }

  async readDirEntries(p: string): Promise<DirEntryInfo[]> {
    let base = p
    while (base.endsWith('/')) base = base.slice(0, -1)
    const prefix = base + '/'
    const names = new Map<string, boolean>() // name → isDir（目录标记优先）
    // 文件路径推导：直接子文件 isDir=false；首段目录（路径还有更深层）isDir=true
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const seg = rest.split('/')[0]!
      names.set(seg, rest.includes('/') || names.get(seg) === true)
    }
    // 显式目录集合：直接子目录计入；目录标记覆盖同名文件推导
    for (const dir of this.dirs) {
      if (!dir.startsWith(prefix)) continue
      const rest = dir.slice(prefix.length)
      if (rest.includes('/')) continue // 祖先目录非本层直接子项
      names.set(rest, true)
    }
    return [...names].map(([name, isDir]) => ({ name, isDir }))
  }

  /** 记入目录及其全部祖先（'/' 分隔），与递归 mkdir 语义一致 */
  private recordDirChain(p: string): void {
    let base = p
    while (base.endsWith('/')) base = base.slice(0, -1)
    while (base !== '') {
      this.dirs.add(base)
      const i = base.lastIndexOf('/')
      if (i <= 0) break // i===0 时剩余为根 ''，无需记入
      base = base.slice(0, i)
    }
  }
}
