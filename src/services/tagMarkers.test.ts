import { describe, expect, test } from 'vitest'
import { extractTagMarkers, hasTagMarkers, injectTagMarkers, stripTagMarkers } from './tagMarkers'

describe('tagMarkers（节点标签句尾 #tag 标记，与 ::icon 同构）', () => {
  test('无标记快速路径：strip 原样返回、extract 空', () => {
    expect(stripTagMarkers('普通节点')).toBe('普通节点')
    expect(stripTagMarkers('a#b 句中井号无空白前导')).toBe('a#b 句中井号无空白前导')
    expect(hasTagMarkers('句中 #话题 不是行尾')).toBe(false)
    expect(hasTagMarkers('版本 v2#3')).toBe(false)
    expect(extractTagMarkers('普通节点')).toEqual([])
  })

  test('单/多标记：剥净与提取（保序去重，中文/英文/连字符/下划线合法）', () => {
    expect(stripTagMarkers('待办 #采购')).toBe('待办')
    expect(stripTagMarkers('买牛奶 #采购 #urgent #采购')).toBe('买牛奶')
    expect(extractTagMarkers('买牛奶 #采购 #urgent #采购')).toEqual(['采购', 'urgent'])
    expect(extractTagMarkers('排期 #待处理')).toEqual(['待处理'])
    expect(extractTagMarkers('任务 #p-1 #a_b')).toEqual(['p-1', 'a_b'])
  })

  test('inject 与 strip 互逆；空数组原样返回', () => {
    const text = '节点'
    expect(injectTagMarkers(text, ['采购', 'urgent'])).toBe('节点 #采购 #urgent')
    expect(stripTagMarkers(injectTagMarkers(text, ['采购']))).toBe(text)
    expect(injectTagMarkers(text, [])).toBe(text)
  })

  test('非法形态不构成标记——文本不受影响（宽容不丢内容）', () => {
    expect(extractTagMarkers('x #C#')).toEqual([]) // 标签内禁 #：第二井号挡住行尾锚定，整体放弃
    expect(hasTagMarkers('x #C#')).toBe(false)
    expect(extractTagMarkers('x #')).toEqual([]) // 裸井号无内容
    expect(stripTagMarkers('x #C#')).toBe('x #C#')
  })

  test('白名单词边界：全符号词/带标点词不构成标记（收窄正文劫持面）', () => {
    expect(extractTagMarkers('! #$')).toEqual([]) // 全符号词（roundtrip fuzz 反例钉子）
    expect(hasTagMarkers('! #$')).toBe(false)
    expect(extractTagMarkers('x #采购!')).toEqual([]) // 带标点词：词含非法字符即整体放弃
    expect(stripTagMarkers('x #采购!')).toBe('x #采购!')
    expect(extractTagMarkers('x #紧急。')).toEqual([])
  })
})
