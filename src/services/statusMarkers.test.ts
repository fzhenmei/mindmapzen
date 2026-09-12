import { describe, expect, test } from 'vitest'
import { extractStatusMarker, hasStatusMarkers, injectStatusMarker, stripStatusMarkers, TASK_STATUSES } from './statusMarkers'

describe('statusMarkers（句尾 @status 白名单标记）', () => {
  test('五态白名单：todo/doing/blocked/done/dropped', () => {
    expect([...TASK_STATUSES]).toEqual(['todo', 'doing', 'blocked', 'done', 'dropped'])
    expect(extractStatusMarker('修滚动条 @doing')).toBe('doing')
    expect(extractStatusMarker('窗口状态记忆 @todo')).toBe('todo')
    expect(extractStatusMarker('已完成 @done')).toBe('done')
  })

  test('未知 @xxx 视为普通文本：不提取、不剥除、roundtrip 恒等', () => {
    expect(hasStatusMarkers('邮箱 x@foo')).toBe(false)
    expect(extractStatusMarker('自定义 @foo')).toBe(null)
    expect(stripStatusMarkers('自定义 @foo')).toBe('自定义 @foo')
  })

  test('句中 @ 不受影响（仅行尾锚定）', () => {
    expect(hasStatusMarkers('@doing 下午开始')).toBe(false)
  })

  test('互斥：多个状态标记只认最后一个（手写冗余宽容收敛）', () => {
    expect(extractStatusMarker('任务 @todo @done')).toBe('done')
    expect(stripStatusMarkers('任务 @todo @done')).toBe('任务')
  })

  test('inject 与 strip 互逆；null 原样返回', () => {
    expect(injectStatusMarker('任务', 'doing')).toBe('任务 @doing')
    expect(stripStatusMarkers(injectStatusMarker('任务', 'doing'))).toBe('任务')
    expect(injectStatusMarker('任务', null)).toBe('任务')
  })

  test('与其他标记共存：@status 在 ::icon 之后、![alt](src) 之前被剥除', () => {
    expect(stripStatusMarkers('任务 ::flag @doing ![x](a.png)')).toBe('任务 ::flag ![x](a.png)')
  })
})
