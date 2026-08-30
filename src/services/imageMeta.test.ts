import { describe, expect, test } from 'vitest'
import { extractImageMarker, hasImageMarker, injectImageMarker, stripImageMarker } from './imageMarkers'
import { mimeOf, parseImageSize } from './imageMeta'

describe('imageMarkers（M19 行尾 ![alt](src)）', () => {
  test('无标记快速路径；句中图片不构成行尾标记', () => {
    expect(stripImageMarker('普通节点')).toBe('普通节点')
    expect(hasImageMarker('前 ![alt](a.png) 后文')).toBe(false)
    expect(extractImageMarker('普通')).toBeNull()
  })

  test('提取/剥离/注入互逆（含空 alt）', () => {
    expect(extractImageMarker('节点 ![配图](assets/x.png)')).toEqual({
      alt: '配图',
      src: 'assets/x.png',
    })
    expect(extractImageMarker('节点 ![](assets/y.jpg)')?.alt).toBe('')
    expect(stripImageMarker('节点 ![配图](assets/x.png)')).toBe('节点')
    expect(injectImageMarker('节点', { alt: '配图', src: 'assets/x.png' })).toBe(
      '节点 ![配图](assets/x.png)',
    )
    expect(injectImageMarker('节点', null)).toBe('节点')
    // 与图标标记共存（图片在最后，注入顺序在图标之后——serialize 约定）
    expect(stripImageMarker(stripImageMarker('节点 ::flag ![图](a.png)'))).toBe('节点 ::flag')
  })

  test('行尾多枚图只取首枚、其余剥净（宽容不丢文本）', () => {
    expect(extractImageMarker('n ![a](1.png) ![b](2.png)')?.src).toBe('2.png') // 正则锚最后
    expect(stripImageMarker('n ![a](1.png) ![b](2.png)')).toBe('n ![a](1.png)')
  })
})

describe('parseImageSize（字节头同步解析）', () => {
  test('PNG IHDR', () => {
    // 签名(8) + IHDR 长(4)类型(4) + 宽高各 4B 大端：100×60
    const b = new Uint8Array(24)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    b.set([0, 0, 0, 100], 16)
    b.set([0, 0, 0, 60], 20)
    expect(parseImageSize(b)).toEqual({ width: 100, height: 60 })
  })

  test('GIF 小端与 JPEG SOF0', () => {
    const g = new Uint8Array(10)
    g.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0) // GIF89a
    g.set([0xe0, 0x01], 6) // 480
    g.set([0xf0, 0x00], 8) // 240
    expect(parseImageSize(g)).toEqual({ width: 480, height: 240 })
    // JPEG：SOI + APP0 段 + SOF0（高 0x00c8=200，宽 0x0140=320）
    const j = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x04, 0, 0, 0xff, 0xc0, 0, 0x0b, 8, 0, 0xc8, 0x01, 0x40])
    expect(parseImageSize(j)).toEqual({ width: 320, height: 200 })
  })

  test('未知格式 null；mimeOf 扩展名映射', () => {
    expect(parseImageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBeNull()
    expect(mimeOf('a.png')).toBe('image/png')
    expect(mimeOf('b.JPG'.toLowerCase())).toBe('image/jpeg')
    expect(mimeOf('c.webp')).toBe('image/webp')
  })
})
