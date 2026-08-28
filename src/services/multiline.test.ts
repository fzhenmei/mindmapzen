import { describe, expect, test } from 'vitest'
import { splitMultilineText } from './multiline'

describe('splitMultilineText', () => {
  test('按 \n 拆分并 trim 每行', () => {
    expect(splitMultilineText('  首行 \n 第二行\n第三行')).toEqual(['首行', '第二行', '第三行'])
  })
  test('\r\n 与 \r 归一化', () => {
    expect(splitMultilineText('a\r\nb\rc')).toEqual(['a', 'b', 'c'])
  })
  test('丢弃空行与纯空格行', () => {
    expect(splitMultilineText('a\n\n   \nb')).toEqual(['a', 'b'])
  })
  test('单行原样（trim 后）', () => {
    expect(splitMultilineText(' 只有一行 ')).toEqual(['只有一行'])
  })
  test('全空文本返回空数组', () => {
    expect(splitMultilineText('')).toEqual([])
    expect(splitMultilineText('\n \n')).toEqual([])
  })
})
