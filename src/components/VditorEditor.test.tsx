import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { subscribeToast } from '../services/toast'

// jsdom 无布局度量,CodeMirror 完整 init 不可行:mock Vditor 构造,锁 options 契约
// (mode/lang/cdn/value/toolbar)与 input→onChange 接线、受控回流抑制、销毁。
// 构造 options 暴露给测试(__opts):after 回调模拟 vditor 异步 init 完成(真浏览器
// 里 i18n/lute 脚本加载后才 initUI;卸载 destroy 的就绪门控依赖它)
vi.mock('vditor', () => {
  const inst = { setValue: vi.fn(), insertValue: vi.fn(), focus: vi.fn(), destroy: vi.fn(), isDestroyed: false }
  let lastOpts: Record<string, unknown> | null = null
  // 实现须用 function/class 才可 new(vitest 4:箭头函数实现不可构造,stderr 有警告);
  // 构造函数返回对象会替换 new 的 this,故 new Vditor(...) 恒得单例 inst
  const Ctor = vi.fn(function (_host: unknown, opts: Record<string, unknown>) {
    lastOpts = opts
    return inst
  })
  // __inst/__opts 挂 default 上(default import 经 Object.assign 拿得到;挂命名空间则取不到)
  return { default: Object.assign(Ctor, { preview: vi.fn(), __inst: inst, __opts: () => lastOpts }) }
})

import Vditor from 'vditor'
import VditorEditor from './VditorEditor'

/** 测试用上传/解析桩（新契约 props 的默认注入；个别用例覆写。普通函数即可——
 *  默认桩无调用断言需求，少参函数可赋多参 props 类型） */
const uploadImagesStub = async (): Promise<{ md: string } | { error: string }> => ({ md: '' })
const resolveImagesStub = async (): Promise<Map<string, string>> => new Map()

// mock 工厂注入的构造函数与单例 stub(类型断言经 unknown 中转,vi.mock 泛型对不上)
const Ctor = vi.mocked(Vditor)
const inst = (Vditor as unknown as {
  __inst: { setValue: ReturnType<typeof vi.fn>; insertValue: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; isDestroyed: boolean }
  __opts: () => Record<string, unknown> | null
}).__inst
const lastOpts = () => (Vditor as unknown as { __opts: () => Record<string, unknown> | null }).__opts()

afterEach(() => {
  Ctor.mockClear()
  inst.setValue.mockClear()
  inst.focus.mockClear()
  inst.destroy.mockClear()
  inst.isDestroyed = false
})

describe('VditorEditor:VDitor 薄包装契约', () => {
  test('构造参数:sv 分屏、本地 cdn、lang、value 初值、工具栏含自定义 mermaid 项', () => {
    render(<VditorEditor value="初始" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    const opts = Ctor.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.mode).toBe('sv')
    expect(opts.cdn).toBe('vendor/vditor')
    expect(opts.lang).toBe('zh_CN')
    expect(opts.value).toBe('初始')
    // 弹窗预览区关导出工具条(2026-09-09:视口切换+公众号/知乎按钮在编辑场景无用)
    expect((opts.preview as { actions: unknown[] }).actions).toEqual([])
    const toolbar = opts.toolbar as Array<Record<string, unknown>>
    expect(toolbar.some((it) => typeof it === 'object' && it.tip === 'Mermaid')).toBe(true)
    // vditor 4.0.0 IMenuItem.name 必填(运行时作 data-type 与 elements 键),自定义项必须带
    expect(toolbar.some((it) => typeof it === 'object' && it.name === 'mermaid')).toBe(true)
    // mermaid 项接线:click 调实例 insertValue 插入围栏模板图源
    const mermaid = toolbar.find((it) => typeof it === 'object' && it.name === 'mermaid') as { click: () => void }
    mermaid.click()
    expect(inst.insertValue).toHaveBeenCalledWith('```mermaid\ngraph LR\n  A --> B\n```')
    expect(toolbar).toContain('bold')
    expect(toolbar).toContain('table')
  })

  test('input 回调上抛 onChange;外部同值回流不触发 setValue(受控回声抑制)', () => {
    const onChange = vi.fn()
    const { rerender } = render(<VditorEditor value="a" onChange={onChange} lang="en_US" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    const opts = Ctor.mock.calls[0]![1] as { input: (md: string) => void }
    opts.input('b')
    expect(onChange).toHaveBeenCalledWith('b')
    rerender(<VditorEditor value="b" onChange={onChange} lang="en_US" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    expect(inst.setValue).not.toHaveBeenCalled() // b 是本组件回声,不回写
    rerender(<VditorEditor value="c" onChange={onChange} lang="en_US" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    expect(inst.setValue).toHaveBeenCalledWith('c') // 外部真值变化才同步
  })

  test('init 完成即聚焦编辑器(after 调 focus:弹窗打开后直接可输入,无需点击)', () => {
    // 2026-09-22 缺陷回归:sv 的 textarea 异步 init 后才存在,autoFocus 属性挂不上;
    // Radix 开弹窗默认聚焦内容区首个可聚焦元素(× 关闭钮),此前无人把焦点交给编辑器
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    ;(lastOpts()!.after as () => void)()
    expect(inst.focus).toHaveBeenCalledTimes(1)
  })

  test('卸载销毁(init 完成后:after 回调已触发)', () => {
    const { unmount } = render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    // 模拟 vditor 异步 init 完成(i18n/lute 加载 → initUI → after)。注:StrictMode 首轮
    // 挂载-清理在 after 前走阻断分支置过单例 isDestroyed——不影响 destroy 分支的断言
    ;(lastOpts()!.after as () => void)()
    unmount()
    expect(inst.destroy).toHaveBeenCalled()
  })

  test('init 完成前卸载:不 destroy(未建 internal state 会抛错),置 isDestroyed 阻断挂起 init', () => {
    // 真浏览器缺陷回归(2026-09-09 e2e 实测):vditor 构造两段异步,StrictMode 双挂载
    // 在 init 前走卸载清理——裸 destroy 读 this.vditor.element 抛 TypeError 炸穿整树
    const { unmount } = render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    unmount() // 未触发 after:模拟 init 未完成
    expect(inst.destroy).not.toHaveBeenCalled()
    expect(inst.isDestroyed).toBe(true) // 令挂起的 init() 入口早退
  })

  test('after:initUI 后把工具栏 __nw 方向类换 __ne(弹窗 overflow-hidden 下向左展开越左界被裁)', () => {
    // 2026-09-24 缺陷回归:vditor 给 undo/redo 硬编码 tipPosition "nw"(tooltip 右缘锚
    // 按钮中线、向左展开)——本组件唯一宿主是弹窗,DialogContent overflow-hidden(圆角
    // 裁内容)下最左按钮 tooltip 向左越弹窗左界即被裁(e2e 实测 undo 越 59px 裁 64%,
    // 左侧文字不可见);换 "ne"(左缘锚中线-15px 向右展开)全程界内。mock 模式下
    // vditor 不真挂 DOM:host 预置 __nw 假按钮模拟 initUI 产物,after 后断言换类
    const { container } = render(
      <VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />,
    )
    const host = container.querySelector('[data-testid="vditor-host"]')!
    host.innerHTML =
      '<div class="vditor-toolbar"><button class="vditor-tooltipped vditor-tooltipped__nw" data-type="undo"></button><button class="vditor-tooltipped vditor-tooltipped__ne" data-type="bold"></button></div>'
    ;(lastOpts()!.after as () => void)()
    const undoBtn = host.querySelector('[data-type="undo"]')!
    expect(undoBtn.classList.contains('vditor-tooltipped__ne')).toBe(true)
    expect(undoBtn.classList.contains('vditor-tooltipped__nw')).toBe(false)
    // 其他方向类不受影响
    expect(host.querySelector('[data-type="bold"]')!.className).toBe('vditor-tooltipped vditor-tooltipped__ne')
  })

  test('mermaid 项配 tipPosition: n(自定义项缺省拼出 __undefined 方向类,tooltip 无定位规则)', () => {
    // 2026-09-24:vditor MenuItem 构造 className = "vditor-tooltipped__".concat(tipPosition),
    // 自定义项不配则类名成 vditor-tooltipped__undefined——无任何方向规则命中,::after
    // 无 top/left 定位回退静态位置;配 n(居中上方)与内置中间按钮同口径
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    const toolbar = (Ctor.mock.calls[0]![1] as Record<string, unknown>).toolbar as Array<Record<string, unknown>>
    const mermaid = toolbar.find((it) => typeof it === 'object' && it.name === 'mermaid')!
    expect(mermaid.tipPosition).toBe('n')
  })
})

describe('VditorEditor:正文插图接管(2026-09,替换 vditor base64 兜底)', () => {
  const imgFile = (name = '截图.png'): File => new File([new Uint8Array([1])], name, { type: 'image/png' })
  beforeEach(() => {
    inst.insertValue.mockClear() // 全局 afterEach 不清它(旧用例无此需求);本组断言其调用
  })

  test('upload.handler 恒配置:图片文件交 uploadImages,成功 → insertValue(md) 且 handler 返回 null', async () => {
    const received: File[][] = []
    const uploadImages = async (files: File[]): Promise<{ md: string } | { error: string }> => {
      received.push(files)
      return { md: '![截图](assets/截图.png)\n\n' }
    }
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImages} resolveImages={resolveImagesStub} />)
    const handler = (Ctor.mock.calls[0]![1] as { upload: { handler: (f: File[]) => Promise<string | null> } }).upload.handler
    const out = await handler([imgFile(), new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })])
    expect(out).toBeNull()
    // 非图片被过滤,只收到图片条目(按名比较——File 实例含 lastModified 逐次不同)
    expect(received.map((files) => files.map((f) => f.name))).toEqual([['截图.png']])
    expect(inst.insertValue).toHaveBeenCalledWith('![截图](assets/截图.png)\n\n')
  })

  test('uploadImages 返回 error → handler 透传错误串(vditor tip 显示),不插入', async () => {
    const uploadImages = vi.fn(async (): Promise<{ md: string } | { error: string }> => ({ error: '落盘失败' }))
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImages} resolveImages={resolveImagesStub} />)
    const handler = (Ctor.mock.calls[0]![1] as { upload: { handler: (f: File[]) => Promise<string | null> } }).upload.handler
    expect(await handler([imgFile()])).toBe('落盘失败')
    expect(inst.insertValue).not.toHaveBeenCalled()
  })

  test('空列表/全非图片:不调 uploadImages,handler 无操作返回 null', async () => {
    const uploadImages = vi.fn(async (): Promise<{ md: string } | { error: string }> => ({ md: '' }))
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImages} resolveImages={resolveImagesStub} />)
    const handler = (Ctor.mock.calls[0]![1] as { upload: { handler: (f: File[]) => Promise<string | null> } }).upload.handler
    expect(await handler([])).toBeNull()
    expect(await handler([new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })])).toBeNull()
    expect(uploadImages).not.toHaveBeenCalled()
    expect(inst.insertValue).not.toHaveBeenCalled()
  })

  test('preview.parse 接线:预览区相对路径 img 经 resolveImages 换 dataURL', async () => {
    const resolveImages = vi.fn(
      async (): Promise<Map<string, string>> =>
        new Map([
          ['assets/a.png', 'data:image/png;base64,xx'],
          ['assets/配图.png', 'data:image/png;base64,yy'],
        ]),
    )
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImages} />)
    const parse = (Ctor.mock.calls[0]![1] as { preview: { parse: (el: HTMLElement) => void } }).preview.parse
    const el = document.createElement('div')
    el.innerHTML = '<img src="assets/a.png"><img src="assets/%E9%85%8D%E5%9B%BE.png"><img src="https://x.com/b.png">'
    parse(el)
    await vi.waitFor(() => expect(el.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,xx'))
    // 百分号编码形态(vditor 预览会编码非 ASCII src)以解码形态比对命中
    expect(el.querySelectorAll('img')[1]!.getAttribute('src')).toBe('data:image/png;base64,yy')
    // 外链不收也不改
    expect(el.querySelectorAll('img')[2]!.getAttribute('src')).toBe('https://x.com/b.png')
    expect(resolveImages).toHaveBeenCalledWith(new Set(['assets/a.png', 'assets/配图.png']))
  })
})

describe('VditorEditor:正文禁标题(2026-09-22,粘贴标题转加粗 + 工具栏摘除 headings)', () => {
  test('工具栏不含 headings 按钮(正文不支持标题,不引导使用)', () => {
    render(<VditorEditor value="" onChange={() => {}} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    const toolbar = (Ctor.mock.calls[0]![1] as { toolbar: unknown[] }).toolbar
    expect(toolbar).not.toContain('headings')
    expect(toolbar).toContain('bold')
  })

  test('粘贴:插入区间标题行转加粗,setValue 回写 + toast 提醒', () => {
    const toasts: string[] = []
    const unsub = subscribeToast((t) => {
      if (t !== null) toasts.push(t.text)
    })
    const onChange = vi.fn()
    const { container } = render(
      <VditorEditor value="已有\n" onChange={onChange} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />,
    )
    // capture 打标在 vditor 自身处理前(host 即监听目标,at-target 阶段触发)
    fireEvent.paste(container.querySelector('[data-testid="vditor-host"]')!)
    const opts = Ctor.mock.calls[0]![1] as { input: (md: string) => void }
    opts.input('已有\n新段\n\n## 贴来的标题\n')
    expect(inst.setValue).toHaveBeenCalledWith('已有\n新段\n\n**贴来的标题**\n')
    expect(onChange).toHaveBeenCalledWith('已有\n新段\n\n**贴来的标题**\n')
    expect(toasts.some((t) => t.includes('标题'))).toBe(true)
    unsub()
  })

  test('手输 input(无粘贴打标)原样上抛,不转换', () => {
    const onChange = vi.fn()
    render(<VditorEditor value="" onChange={onChange} lang="zh_CN" theme="light" uploadImages={uploadImagesStub} resolveImages={resolveImagesStub} />)
    const opts = Ctor.mock.calls[0]![1] as { input: (md: string) => void }
    opts.input('手输 ## 不转换')
    expect(onChange).toHaveBeenCalledWith('手输 ## 不转换')
    expect(inst.setValue).not.toHaveBeenCalled()
  })
})
