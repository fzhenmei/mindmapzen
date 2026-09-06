import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '../i18n'
import { describeBackendError } from './backendError'

describe('describeBackendError(Rust 错误码本地化)', () => {
  afterEach(async () => { await i18n.changeLanguage('zh-CN') })

  it('已知码按语言映射', async () => {
    expect(describeBackendError('GIT_TIMEOUT')).toBe('git 命令超时（30 秒）')
    await i18n.changeLanguage('en')
    expect(describeBackendError('GIT_TIMEOUT')).toBe('git command timed out (30s)')
  })
  it('未知错误原样透传', () => {
    expect(describeBackendError('some raw git stderr')).toBe('some raw git stderr')
    expect(describeBackendError('INVALID_COLOR: #XYZ')).toBe('INVALID_COLOR: #XYZ')
  })
})
