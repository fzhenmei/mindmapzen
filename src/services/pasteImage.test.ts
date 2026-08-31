import { describe, expect, test } from 'vitest'
import { bytesFromPasteEvent, extOfMime, pasteImageName } from './pasteImage'

// rgbaToPngBytes（Canvas 编码）jsdom 无 2D 上下文，留 E2E 生产路径验证

describe('extOfMime（mime → 后缀）', () => {
  test('已知集合与未知回退', () => {
    expect(extOfMime('image/png')).toBe('png')
    expect(extOfMime('image/jpeg')).toBe('jpg')
    expect(extOfMime('image/gif')).toBe('gif')
    expect(extOfMime('image/webp')).toBe('webp')
    expect(extOfMime('image/bmp')).toBe('bmp')
    expect(extOfMime('image/svg+xml')).toBe('svg')
    expect(extOfMime('application/octet-stream')).toBe('png')
  })

  test('分号参数裁剪与大小写宽容', () => {
    expect(extOfMime('image/png;charset=binary')).toBe('png')
    expect(extOfMime('IMAGE/PNG')).toBe('png')
  })
})

describe('pasteImageName（时间戳命名）', () => {
  test('格式 paste-YYYYMMDD-HHMMSS.ext 且后缀透传', () => {
    expect(pasteImageName('png')).toMatch(/^paste-\d{8}-\d{6}\.png$/)
    expect(pasteImageName('jpg')).toMatch(/^paste-\d{8}-\d{6}\.jpg$/)
  })
})

describe('bytesFromPasteEvent（paste 事件读图）', () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  /** 构造结构化的 mock clipboardData（jsdom DataTransfer 无 items.add，直接传 items 数组） */
  const evt = (items: Array<{ type: string; file: File | null }>) =>
    ({
      clipboardData: {
        items: items.map((it) => ({ type: it.type, getAsFile: () => it.file })),
      },
    }) as unknown as { clipboardData: DataTransfer }

  test('image 条目 → { name, bytes }（name 走 paste- 时间戳 png 名）', async () => {
    const got = await bytesFromPasteEvent(evt([{ type: 'image/png', file: new File([pngBytes], 'x.png', { type: 'image/png' }) }]))
    expect(got).not.toBeNull()
    expect(got!.name).toMatch(/^paste-\d{8}-\d{6}\.png$/)
    expect(Array.from(got!.bytes)).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  test('text 在前 image 在后仍取 image（微信截图剪贴板常有文本伴随）', async () => {
    const got = await bytesFromPasteEvent(
      evt([
        { type: 'text/plain', file: new File(['字'], 't.txt', { type: 'text/plain' }) },
        { type: 'image/jpeg', file: new File([pngBytes], 'x.jpg', { type: 'image/jpeg' }) },
      ]),
    )
    expect(got?.name).toMatch(/\.jpg$/)
  })

  test('无图条目 / 空 items / null clipboardData → null', async () => {
    expect(await bytesFromPasteEvent(evt([{ type: 'text/plain', file: new File(['字'], 't.txt', { type: 'text/plain' }) }]))).toBeNull()
    expect(await bytesFromPasteEvent(evt([]))).toBeNull()
    expect(await bytesFromPasteEvent({ clipboardData: null })).toBeNull()
  })

  test('getAsFile 返回 null 的坏条目跳过', async () => {
    expect(await bytesFromPasteEvent(evt([{ type: 'image/png', file: null }]))).toBeNull()
  })
})
