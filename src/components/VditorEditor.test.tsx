import { render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

// jsdom 无布局度量,CodeMirror 完整 init 不可行:mock Vditor 构造,锁 options 契约
// (mode/lang/cdn/value/toolbar)与 input→onChange 接线、受控回流抑制、销毁
vi.mock('vditor', () => {
  const inst = { setValue: vi.fn(), insertValue: vi.fn(), destroy: vi.fn() }
  // 实现须用 function/class 才可 new(vitest 4:箭头函数实现不可构造,stderr 有警告);
  // 构造函数返回对象会替换 new 的 this,故 new Vditor(...) 恒得单例 inst
  const Ctor = vi.fn(function () {
    return inst
  })
  // __inst 挂 default 上(default import 经 Object.assign 拿得到;挂命名空间则取不到)
  return { default: Object.assign(Ctor, { preview: vi.fn(), __inst: inst }) }
})

import Vditor from 'vditor'
import VditorEditor from './VditorEditor'

// mock 工厂注入的构造函数与单例 stub(类型断言经 unknown 中转,vi.mock 泛型对不上)
const Ctor = vi.mocked(Vditor)
const inst = (Vditor as unknown as {
  __inst: { setValue: ReturnType<typeof vi.fn>; insertValue: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
}).__inst

afterEach(() => {
  Ctor.mockClear()
  inst.setValue.mockClear()
  inst.destroy.mockClear()
})

describe('VditorEditor:VDitor 薄包装契约', () => {
  test('构造参数:sv 分屏、本地 cdn、lang、value 初值、工具栏含自定义 mermaid 项', () => {
    render(<VditorEditor value="初始" onChange={() => {}} lang="zh_CN" theme="light" />)
    const opts = Ctor.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.mode).toBe('sv')
    expect(opts.cdn).toBe('vendor/vditor')
    expect(opts.lang).toBe('zh_CN')
    expect(opts.value).toBe('初始')
    const toolbar = opts.toolbar as Array<Record<string, unknown>>
    expect(toolbar.some((it) => typeof it === 'object' && it.tip === 'Mermaid')).toBe(true)
    // vditor 4.0.0 IMenuItem.name 必填(运行时作 data-type 与 elements 键),自定义项必须带
    expect(toolbar.some((it) => typeof it === 'object' && it.name === 'mermaid')).toBe(true)
    expect(toolbar).toContain('bold')
    expect(toolbar).toContain('table')
  })

  test('input 回调上抛 onChange;外部同值回流不触发 setValue(受控回声抑制)', () => {
    const onChange = vi.fn()
    const { rerender } = render(<VditorEditor value="a" onChange={onChange} lang="en_US" theme="light" />)
    const opts = Ctor.mock.calls[0]![1] as { input: (md: string) => void }
    opts.input('b')
    expect(onChange).toHaveBeenCalledWith('b')
    rerender(<VditorEditor value="b" onChange={onChange} lang="en_US" theme="light" />)
    expect(inst.setValue).not.toHaveBeenCalled() // b 是本组件回声,不回写
    rerender(<VditorEditor value="c" onChange={onChange} lang="en_US" theme="light" />)
    expect(inst.setValue).toHaveBeenCalledWith('c') // 外部真值变化才同步
  })

  test('卸载销毁', () => {
    const { unmount } = render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" />)
    unmount()
    expect(inst.destroy).toHaveBeenCalled()
  })
})
