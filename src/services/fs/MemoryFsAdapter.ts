import type { DirEntryInfo, FileStat, FsAdapter } from '../../types/files'

/** 文本条目：createdAt = 首写时间（rename 保留，同真实 FS 的 birthtime 语义） */
interface Entry { contents: string; modifiedAt: number; createdAt: number }
/** 二进制条目（writeBytes）：字节 + 写入/创建时间（stat 语义同文本条目） */
interface BinaryEntry { bytes: Uint8Array; modifiedAt: number; createdAt: number }

// 与 TauriFsAdapter 同语义的唯一临时名（写 tmp → rename），测试替身须忠实模拟并发防撞行为
let tmpSeq = 0

/** 测试用内存文件系统：文件目录隐式推导 + 显式 mkdir/ensureDir 记录的目录集合 */
export class MemoryFsAdapter implements FsAdapter {
  private readonly files = new Map<string, Entry>()
  /** 二进制文件（M5b Task 5 writeBytes）：独立 Map 按同键存，目录推导时与文本文件合并计入 */
  private readonly binaries = new Map<string, BinaryEntry>()
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
    this.files.set(tmp, { contents, modifiedAt: Date.now(), createdAt: Date.now() })
    await this.rename(tmp, p)
  }

  async writeBytes(p: string, bytes: Uint8Array): Promise<void> {
    // 复制入册：调用方后续改动缓冲区不应影响已写内容（与真实文件系统语义一致）
    this.binaries.set(p, { bytes: bytes.slice(), modifiedAt: Date.now(), createdAt: Date.now() })
  }

  /** 读取二进制文件（writeBytes 的测试侧读回口，非 FsAdapter 接口成员） */
  async readBytes(p: string): Promise<Uint8Array> {
    const b = this.binaries.get(p)
    if (!b) throw new Error(`文件不存在：${p}`)
    return b.bytes.slice()
  }

  async readDir(p: string): Promise<string[]> {
    let base = p
    while (base.endsWith('/')) base = base.slice(0, -1)
    const prefix = base + '/'
    const names = new Set<string>()
    for (const key of [...this.files.keys(), ...this.binaries.keys()]) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]!)
    }
    return [...names]
  }

  async statModified(p: string): Promise<number> {
    return this.files.get(p)?.modifiedAt ?? this.binaries.get(p)?.modifiedAt ?? 0
  }

  /** 元数据三件（M15）：size = 字节长（UTF-8 实长，中文内容与字符数不同）；缺失即抛（同真实 stat） */
  async stat(p: string): Promise<FileStat> {
    const e = this.files.get(p)
    if (e) {
      return {
        size: new TextEncoder().encode(e.contents).length,
        createdAt: e.createdAt,
        modifiedAt: e.modifiedAt,
      }
    }
    const b = this.binaries.get(p)
    if (b) return { size: b.bytes.length, createdAt: b.createdAt, modifiedAt: b.modifiedAt }
    throw new Error(`文件不存在：${p}`)
  }

  async rename(a: string, b: string): Promise<void> {
    const e = this.files.get(a)
    if (!e) throw new Error(`文件不存在：${a}`)
    this.files.delete(a)
    // createdAt 保留（改名不改创建时间，同真实 FS birthtime）
    this.files.set(b, { contents: e.contents, createdAt: e.createdAt, modifiedAt: Date.now() })
  }

  async remove(p: string): Promise<void> {
    // 文件或目录（2026-09 目录右键删除）：目录时递归清尽后代（对齐 Tauri trash_delete
    // 的整目录回收语义——文件/二进制/显式目录集合按前缀清除），removeLog 只记本次入口路径
    let base = p
    while (base.endsWith('/')) base = base.slice(0, -1)
    const prefix = base + '/'
    for (const key of this.files.keys()) {
      if (key === base || key.startsWith(prefix)) this.files.delete(key)
    }
    for (const key of this.binaries.keys()) {
      if (key === base || key.startsWith(prefix)) this.binaries.delete(key)
    }
    for (const dir of this.dirs) {
      if (dir === base || dir.startsWith(prefix)) this.dirs.delete(dir)
    }
    this.removeLog.push(base)
  }

  async exists(p: string): Promise<boolean> {
    return this.files.has(p) || this.binaries.has(p)
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
    // 文件路径推导：直接子文件 isDir=false；首段目录（路径还有更深层）isDir=true（文本与二进制同权）
    for (const key of [...this.files.keys(), ...this.binaries.keys()]) {
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
