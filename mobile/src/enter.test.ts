import { expect, it } from 'vitest'
import { enterSends } from './App'

// 回车即发送(2026-09-27 手机操作习惯):换行不再作为输入手段,多行靠粘贴
it('Enter 触发发送', () => {
  expect(enterSends({ key: 'Enter', isComposing: false })).toBe(true)
})

it('输入法合成中的 Enter 不发送(中文候选确认)', () => {
  expect(enterSends({ key: 'Enter', isComposing: true })).toBe(false)
})

it('其他按键不发送', () => {
  expect(enterSends({ key: 'a', isComposing: false })).toBe(false)
  expect(enterSends({ key: 'Shift', isComposing: false })).toBe(false)
})
