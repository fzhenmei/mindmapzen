import { describe, expect, test, vi } from 'vitest'
import { copyPngToClipboard, dataUrlToBytes, exportPngToFile, exportSvgToFile } from './exportImage'
import type { MindMapHandle } from '../types/engine'

// PNG 魔数（\x89PNG\r\n\x1a\n）：钉死 data URL → 字节解码链路的逐字节忠实性
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const pngDataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...PNG_MAGIC))}`
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
const svgDataUrl = `data:image/svg+xml;base64,${btoa(SVG_TEXT)}`

/** 假引擎：doExport.png/svg 返回固定 data URL（真实返回见 docs/notes/engine-api.md「M5b 核验 (a)」：base64 字符串而非 Blob） */
const fakeMm = (): MindMapHandle & { doExport: { png: ReturnType<typeof vi.fn>; svg: ReturnType<typeof vi.fn> } } =>
  ({
    doExport: {
      png: vi.fn(async () => pngDataUrl),
      svg: vi.fn(async () => svgDataUrl),
    },
  }) as unknown as MindMapHandle & {
    doExport: { png: ReturnType<typeof vi.fn>; svg: ReturnType<typeof vi.fn> }
  }

describe('dataUrlToBytes', () => {
  test('解码 base64 段为原始字节（PNG 魔数逐字节一致）', () => {
    expect([...dataUrlToBytes(pngDataUrl)]).toEqual(PNG_MAGIC)
  })

  test('只取逗号后段（任意 mime 的 data URL）', () => {
    expect([...dataUrlToBytes('data:application/octet-stream;base64,AAEC')]).toEqual([0, 1, 2])
  })
})

describe('exportPngToFile', () => {
  test('引擎 png() 结果解码后写盘：路径与字节断言', async () => {
    const mm = fakeMm()
    const writeBytes = vi.fn()
    await exportPngToFile(mm, '/ws/a.png', writeBytes)
    expect(mm.doExport.png).toHaveBeenCalledTimes(1)
    expect(writeBytes).toHaveBeenCalledTimes(1)
    const [path, bytes] = writeBytes.mock.calls[0] as [string, Uint8Array]
    expect(path).toBe('/ws/a.png')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual(PNG_MAGIC)
  })
})

describe('exportSvgToFile', () => {
  test('svg 名取 savePath 基名（去目录与扩展，引擎写入 svg <title>），字节写盘', async () => {
    const mm = fakeMm()
    const writeBytes = vi.fn()
    await exportSvgToFile(mm, '/ws/子/我的图.svg', writeBytes)
    expect(mm.doExport.svg).toHaveBeenCalledWith('我的图')
    expect(writeBytes).toHaveBeenCalledTimes(1)
    const [path, bytes] = writeBytes.mock.calls[0] as [string, Uint8Array]
    expect(path).toBe('/ws/子/我的图.svg')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes]).toEqual([...SVG_TEXT].map((c) => c.charCodeAt(0)))
  })
})

describe('copyPngToClipboard', () => {
  test('writeImage 收到长度>0 的 Uint8Array 且字节与 png() 一致', async () => {
    const mm = fakeMm()
    const writeImage = vi.fn()
    await copyPngToClipboard(mm, writeImage)
    expect(writeImage).toHaveBeenCalledTimes(1)
    const [bytes] = writeImage.mock.calls[0] as [Uint8Array]
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
    expect([...bytes]).toEqual(PNG_MAGIC)
  })
})

describe('引擎未注册 Export 插件', () => {
  test('三入口均以中文错误拒绝（不静默产出空文件/空剪贴板）', async () => {
    const mm = {} as MindMapHandle
    await expect(exportPngToFile(mm, '/a.png', vi.fn())).rejects.toThrow('引擎未注册 Export 插件')
    await expect(exportSvgToFile(mm, '/a.svg', vi.fn())).rejects.toThrow('引擎未注册 Export 插件')
    await expect(copyPngToClipboard(mm, vi.fn())).rejects.toThrow('引擎未注册 Export 插件')
  })
})
