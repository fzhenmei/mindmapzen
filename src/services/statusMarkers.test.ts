import { describe, expect, test } from 'vitest'
import { stripImageMarker } from './imageMarkers'
import { BOARD_STATUSES, extractStatusMarker, hasStatusMarkers, injectStatusMarker, stripStatusMarkers, TASK_STATUSES } from './statusMarkers'

describe('statusMarkers（句尾 @status 白名单标记）', () => {
  test('六态白名单：todo/doing/blocked/done/dropped/archived', () => {
    expect([...TASK_STATUSES]).toEqual(['todo', 'doing', 'blocked', 'done', 'dropped', 'archived'])
    expect(extractStatusMarker('修滚动条 @doing')).toBe('doing')
    expect(extractStatusMarker('窗口状态记忆 @todo')).toBe('todo')
    expect(extractStatusMarker('已完成 @done')).toBe('done')
    // 第六状态（2026-09 看板治理）：归档 = 生命周期终态「翻篇」，与五态同管线
    expect(extractStatusMarker('翻篇了 @archived')).toBe('archived')
    expect(stripStatusMarkers('翻篇了 @archived')).toBe('翻篇了')
    expect(injectStatusMarker('翻篇了', 'archived')).toBe('翻篇了 @archived')
    // 派生契约（2026-09 看板治理）：看板五列 = 六态排除 archived——列循环依赖此序，
    // 漏项/乱序/误含 archived 即测出
    expect(BOARD_STATUSES).toEqual(['todo', 'doing', 'blocked', 'done', 'dropped'])
  })

  test('未知 @xxx 视为普通文本：不提取、不剥除、roundtrip 恒等', () => {
    expect(hasStatusMarkers('邮箱 x@foo')).toBe(false)
    expect(extractStatusMarker('自定义 @foo')).toBeNull()
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

  test('剥除顺序：image 先剥后 @status 到行尾可剥（makeNode 管道语义；::icon/tag 剥除是后续步骤）', () => {
    expect(stripImageMarker('任务 ::flag @doing ![x](a.png)')).toBe('任务 ::flag @doing')
    expect(stripStatusMarkers(stripImageMarker('任务 ::flag @doing ![x](a.png)'))).toBe('任务 ::flag')
  })

  test('句中 @status 是普通文本：strip 原样返回（防回归，不丢内容红线）', () => {
    expect(stripStatusMarkers('提醒 @todo 下午')).toBe('提醒 @todo 下午')
  })

  test('前置锚定：裸 @status（无前导空白）识别并剥成空串；紧贴词字符的 @ 不构成标记', () => {
    // 空文本节点序列化产物 `#  @doing` 经标题前缀剥除后恰是裸形态，extract/strip 必须同认
    expect(extractStatusMarker('@todo')).toBe('todo')
    expect(stripStatusMarkers('@doing')).toBe('')
    expect(stripStatusMarkers('@todo')).toBe('')
    expect(hasStatusMarkers('@done')).toBe(true)
    // 裸形态多段同样循环剥除、只认最后一个
    expect(stripStatusMarkers('@todo @done')).toBe('')
    expect(extractStatusMarker('@todo @done')).toBe('done')
    // 紧贴词字符的 @（无前置空白/句首）不构成标记（三函数口径一致）
    expect(hasStatusMarkers('邮箱 x@doing')).toBe(false)
    expect(extractStatusMarker('邮箱 x@doing')).toBeNull()
    expect(stripStatusMarkers('邮箱 x@doing')).toBe('邮箱 x@doing')
  })
})
