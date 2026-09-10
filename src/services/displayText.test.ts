// src/services/displayText.test.ts —— 显示层标记剥离链(连线/图标/标签)共享口径:
// 原本内联在 MarkdownPreview,发布复制(wechatCopy)与预览需同链,抽服务钉死一处
import { describe, expect, test } from 'vitest'
import { toDisplayText } from './displayText'

describe('toDisplayText:画布显示层标记剥离', () => {
  test('三类标记全剥:句中 [[链接]]、行尾 #标签 ::图标(规范序)', () => {
    expect(toDisplayText('- 采购事项 [[供应商B]] #urgent ::flag')).toBe('- 采购事项')
  })

  test('逐行独立剥离,无标记行原样', () => {
    const md = ['- 甲 [[乙]] ::star', '# 纯标题', '正文 #tag1']
    expect(toDisplayText(md.join('\n'))).toBe(['- 甲', '# 纯标题', '正文'].join('\n'))
  })

  test('空串与纯文本直通', () => {
    expect(toDisplayText('')).toBe('')
    expect(toDisplayText('普通一句话。')).toBe('普通一句话。')
  })
})
