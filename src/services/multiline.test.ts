import { describe, expect, test } from 'vitest'
import { sanitizeExecArgs, splitMultilineText } from './multiline'

/** 命令参数中的引擎节点占位（sanitize 只按位置处理，不读节点本体） */
const node = { uid: 'x' }

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

describe('sanitizeExecArgs（提交口换行归一化，2026-09-07 Word 粘贴毒节点治本）', () => {
  test('SET_NODE_TEXT：\r\n / 裸 \r / \n 全部归一为空格（节点文本单行语义）', () => {
    const [, text] = sanitizeExecArgs('SET_NODE_TEXT', [node, 'SpringBoot Actuator\r\n未授权访问\r漏洞'])
    expect(text).toBe('SpringBoot Actuator 未授权访问 漏洞')
  })

  test('SET_NODE_DATA：text 单行化、body/note 多行保留仅剥 \r', () => {
    const [, data] = sanitizeExecArgs('SET_NODE_DATA', [node, { text: 'a\rb', body: 'x\r\ny\rz', note: 'n\r\nm' }]) as [unknown, { text: string; body: string; note: string }]
    expect(data.text).toBe('a b')
    expect(data.body).toBe('x\ny\nz')
    expect(data.note).toBe('n\nm')
  })

  test('SET_NODE_DATA 不修改原载荷对象（浅拷贝）', () => {
    const payload = { text: 'a\rb', body: undefined }
    sanitizeExecArgs('SET_NODE_DATA', [node, payload])
    expect(payload.text).toBe('a\rb')
  })

  test('其余命令与非字符串载荷原样返回（不误伤）', () => {
    expect(sanitizeExecArgs('SET_NODE_EXPAND', [node, false])).toEqual([node, false])
    expect(sanitizeExecArgs('INSERT_CHILD_NODE', [false, [], { text: 'x' }])).toEqual([false, [], { text: 'x' }])
    expect(sanitizeExecArgs('SET_NODE_TEXT', [node])).toEqual([node])
  })
})
