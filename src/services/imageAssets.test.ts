// src/services/imageAssets.test.ts —— 资产落盘（writeImageAsset，2026-09 正文插图共用）
// 与 md 全文图片 src 收集（collectMdImageSrcs）单测
import { beforeEach, describe, expect, test } from 'vitest'
import { MemoryFsAdapter } from './fs/MemoryFsAdapter'
import { collectMdImageSrcs, writeImageAsset } from './imageAssets'

let fs: MemoryFsAdapter
beforeEach(() => {
  fs = new MemoryFsAdapter()
})

describe('writeImageAsset（防撞名落盘 assets/）', () => {
  test('新名直接落盘并返回相对 src 与 stem；目录已建', async () => {
    const r = await writeImageAsset(fs, '/ws', '截图.png', new Uint8Array([1, 2]))
    expect(r).toEqual({ src: 'assets/截图.png', stem: '截图' })
    expect([...(await fs.readBytes('/ws/assets/截图.png'))]).toEqual([1, 2])
  })

  test('同名已存在则加 -N 序号，不改写既有文件', async () => {
    await fs.ensureDir('/ws/assets')
    await fs.writeBytes('/ws/assets/a.png', new Uint8Array([9]))
    const r = await writeImageAsset(fs, '/ws', 'a.png', new Uint8Array([1]))
    expect(r).toEqual({ src: 'assets/a-2.png', stem: 'a' })
    expect([...(await fs.readBytes('/ws/assets/a.png'))]).toEqual([9]) // 原文件未被覆盖
    expect([...(await fs.readBytes('/ws/assets/a-2.png'))]).toEqual([1])
  })

  test('无扩展名回退 .png 后缀', async () => {
    const r = await writeImageAsset(fs, '/ws', 'blob', new Uint8Array([1]))
    expect(r?.src).toBe('assets/blob.png')
  })

  test('wsDir 为 null 返回 null（兜底，不落盘）', async () => {
    expect(await writeImageAsset(fs, null, 'a.png', new Uint8Array([1]))).toBeNull()
  })
})

describe('collectMdImageSrcs（md 全文图片 src 收集）', () => {
  test('收集全文各级引用：标题行、正文行、引用块（正文）内；去重', () => {
    const md = [
      '# 根 ![配图](assets/a.png)', '',
      '> 正文块内 ![内嵌](assets/b.png)', '> 第二行同图 ![again](assets/b.png)', '',
      '普通段落 ![c](assets/c.jpg)', '',
    ].join('\n')
    expect(collectMdImageSrcs(md)).toEqual(new Set(['assets/a.png', 'assets/b.png', 'assets/c.jpg']))
  })

  test('外链与内嵌 data: 不收；无图返回空集', () => {
    const md = '![](https://example.com/x.png)\n\n![](data:image/png;base64,xxx)\n\n纯文本'
    expect(collectMdImageSrcs(md)).toEqual(new Set())
  })

  test('绝对路径不收（与 buildImageMeta 相对口径一致）', () => {
    expect(collectMdImageSrcs('![](/etc/a.png)\n\n![](C:/Users/x/a.png)')).toEqual(new Set())
  })
})
