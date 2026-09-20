import { test, expect } from 'vitest'
import { planBasketReload } from './basketSync'

const ev = { mapPath: '/ws/点子篮子.md' }

test('编辑器开篮子图且干净：静默重载（reopenEditor 语义）', () => {
  expect(planBasketReload({ route: 'editor', currentMdPath: '/ws/点子篮子.md', dirty: false }, ev)).toBe('reload')
})

test('编辑器开篮子图且有脏态：提示（保存链冲突对话框仍兜底）', () => {
  expect(planBasketReload({ route: 'editor', currentMdPath: '/ws/点子篮子.md', dirty: true }, ev)).toBe('notify')
})

test('打开的是别的图 / 案头路由 / 未开图：忽略', () => {
  expect(planBasketReload({ route: 'editor', currentMdPath: '/ws/别的.md', dirty: false }, ev)).toBe('ignore')
  expect(planBasketReload({ route: 'library', currentMdPath: null, dirty: false }, ev)).toBe('ignore')
  expect(planBasketReload({ route: 'editor', currentMdPath: null, dirty: false }, ev)).toBe('ignore')
})
