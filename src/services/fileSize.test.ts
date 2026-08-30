import { describe, expect, it } from 'vitest'
import { formatFileSize } from './fileSize'

describe('formatFileSize', () => {
  it('边界与字节档', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(-5)).toBe('0 B')
    expect(formatFileSize(Number.NaN)).toBe('0 B')
    expect(formatFileSize(1)).toBe('1 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('KB/MB 档与一位小数去尾零', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(12288)).toBe('12 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1 MB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('GB 档外推（防御性）', () => {
    expect(formatFileSize(2 * 1024 ** 3)).toBe('2 GB')
  })
})
