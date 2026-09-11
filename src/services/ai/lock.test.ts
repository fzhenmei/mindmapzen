// src/services/ai/lock.test.ts —— AI 回合锁真值表（Task 5，spec §6）
import { afterEach, describe, expect, test } from 'vitest'
import { beginAiTurn, endAiTurn, isAiTurnActive, isUserCommandBlocked, withAiCall } from './lock'

afterEach(() => endAiTurn())

describe('AI 回合锁', () => {
  test('idle 不拦任何命令', () => {
    expect(isAiTurnActive()).toBe(false)
    expect(isUserCommandBlocked('INSERT_CHILD_NODE')).toBe(false)
  })
  test('回合中拦编辑命令，放行点选/框选', () => {
    beginAiTurn()
    expect(isUserCommandBlocked('INSERT_CHILD_NODE')).toBe(true)
    expect(isUserCommandBlocked('SET_NODE_TEXT')).toBe(true)
    expect(isUserCommandBlocked('REMOVE_NODE')).toBe(true)
    expect(isUserCommandBlocked('BACK')).toBe(true) // 回合中禁撤销（AI 仍持有 uid）
    expect(isUserCommandBlocked('SET_NODE_ACTIVE')).toBe(false) // 点选节点仍可用
    expect(isUserCommandBlocked('CLEAR_ACTIVE_NODE')).toBe(false)
    expect(isUserCommandBlocked('SELECT_ALL')).toBe(false)
  })
  test('AI 内部调用持 token 放行', () => {
    beginAiTurn()
    expect(withAiCall(() => isUserCommandBlocked('INSERT_CHILD_NODE'))).toBe(false)
    expect(isUserCommandBlocked('INSERT_CHILD_NODE')).toBe(true) // token 不外泄
  })
  test('endAiTurn 解锁', () => {
    beginAiTurn()
    endAiTurn()
    expect(isUserCommandBlocked('INSERT_CHILD_NODE')).toBe(false)
  })
})
