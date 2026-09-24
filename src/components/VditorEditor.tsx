// src/components/VditorEditor.tsx —— VDitor 编辑器薄包装(2026-09-08 正文弹窗):
// mode sv 分屏(左源码右预览)、工具栏精选、lang 跟 i18next、主题跟 appStore(经
// props 注入)。受控语义:value 初值进构造;input 回调上抛 onChange(lastEmitted 防
// 受控回流回声重置光标);外部真值变化才 setValue。cache 关闭——草稿由宿主
// useBodyDialog 管理,不用 vditor 的 localStorage 草稿。卸载 destroy——但 vditor
// 构造是两段异步(i18n/lute 脚本加载后才 init 建 internal state),init 完成前
// destroy 读未建的 this.vditor.element 会抛 TypeError(2026-09-09 e2e 真浏览器实测:
// StrictMode 双挂载即触发,异常炸穿 React 整树白屏),故卸载分两态处理(见清理段)。
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { VDITOR_CDN } from '../services/vditorPreview'
import { applyImgSrcMap, collectRelativeImgSrcs } from '../services/imageAssets'
import { convertPastedHeadings } from '../services/bodyPaste'
import { showToast } from '../services/toast'
import { i18n } from '../i18n'

/** mermaid 围栏插入钮(vditor 无内置 mermaid 工具栏项):光标处插入模板图源 */
const MERMAID_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>'

/** 正文插图上传结果：md = 待插入片段（宿主已落盘 assets/）；error = 失败提示（vditor tip 显示） */
export type BodyImageUploadResult = { md: string } | { error: string }

interface Props {
  value: string
  onChange(next: string): void
  lang: 'zh_CN' | 'en_US'
  theme: 'light' | 'dark'
  /** 粘贴/拖入图片接管（2026-09 替换 vditor base64 兜底）：图片文件 → 落盘 assets/，
   *  返回待插入 md（`![stem](assets/x.png)`，与节点插图同口径）或错误提示 */
  uploadImages(files: File[]): Promise<BodyImageUploadResult>
  /** 预览区相对路径 src → dataURL（分屏预览 webview 解析不了工作区相对路径） */
  resolveImages(srcs: Set<string>): Promise<Map<string, string>>
}

export default function VditorEditor({ value, onChange, lang, theme, uploadImages, resolveImages }: Readonly<Props>) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const vdRef = useRef<Vditor | null>(null)
  // 最近一次上抛的值:滤掉受控回流的同值回声(否则 setValue 重置光标)
  const lastEmittedRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange // 渲染期同步,构造闭包恒读最新
  const uploadRef = useRef(uploadImages)
  uploadRef.current = uploadImages
  const resolveRef = useRef(resolveImages)
  resolveRef.current = resolveImages
  // 粘贴打标(2026-09-22 正文禁标题):capture 阶段先于 vditor 自身处理打标,不拦截——
  // HTML→md 转换仍由 vditor 完成,input 回调按标对插入区间做标题→加粗转换
  const pastedRef = useRef(false)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const mark = (): void => {
      pastedRef.current = true
    }
    host.addEventListener('paste', mark, true)
    return () => host.removeEventListener('paste', mark, true)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    // init 就绪标记:vditor 在 i18n/lute 脚本加载完成(initUI 挂 DOM、注册监听)后
    // 调 after——此后 destroy 才是完整安全的(清 DOM + UIUnbindListener 摘 resize 监听)
    let inited = false
    /** upload.handler 异步体:宿主落盘返回 md → insertValue;错误串由 handler 透传
     *  (插入经 vdRef.current——vd 构造后才有实例,粘贴必在构造完成后) */
    const runBodyUpload = async (imgs: File[]): Promise<string | null> => {
      const r = await uploadRef.current(imgs)
      if ('error' in r) return r.error
      vdRef.current?.insertValue(r.md)
      return null
    }
    const vd = new Vditor(host, {
      mode: 'sv',
      lang,
      cdn: VDITOR_CDN,
      value,
      height: '100%',
      theme: theme === 'dark' ? 'dark' : 'classic',
      cache: { enable: false },
      // 弹窗预览区关导出工具条(视口切换+公众号/知乎按钮):正文编辑场景无用且碍眼
      // (2026-09-09 用户反馈;案头详情的发布场景另行走 PUBLISH_ACTIONS 白名单)。
      // parse:分屏预览渲染后回调——相对路径 img 经 resolveImages 换 dataURL(2026-09
      // 正文插图改 assets/ 相对路径的配套;webview 解析不了工作区相对路径)
      preview: {
        actions: [],
        parse: (el: HTMLElement) => {
          const srcs = collectRelativeImgSrcs(el)
          if (srcs.size === 0) return
          void resolveRef.current(srcs).then((map) => applyImgSrcMap(el, map))
        },
      },
      // 正文插图接管(2026-09):vditor 无 upload 配置时粘贴/拖入图片走内置 base64 兜底
      // (FileReader.readAsDataURL 直插 data: 串,巨型 md 毒化保存链)——handler 恒配置
      // 截断该分支:图片交宿主落盘 assets/,成功 insertValue 相对路径引用(与节点插图同口径),
      // 失败返回错误串由 vditor tip 显示(显式出口);非图片文件同 vditor 默认忽略。
      // 注:vditor 类型面 handler 只收窄 union(不认 Promise<string|null>),runBodyUpload
      // 的联合结果以单点断言收窄回 union 内
      upload: {
        handler: (files: File[]): string | null | Promise<string> | Promise<null> => {
          const imgs = files.filter((f) => f.type.startsWith('image/'))
          if (imgs.length === 0) return null
          return runBodyUpload(imgs) as Promise<string> | Promise<null>
        },
      },
      toolbar: [
        // headings 已摘除(2026-09-22 正文禁标题):正文不支持标题,不引导使用;
        // 粘贴进来的标题由 input 回调转加粗提醒
        'undo', 'redo', '|', 'bold', 'italic', 'strike', '|',
        'quote', 'line', 'code', 'inline-code', '|', 'link', 'list', 'check', '|', 'table',
        {
          // vditor 4.0.0 类型 IMenuItem.name 必填:运行时走 Custom 类,作 data-type
          // 与 toolbar.elements 键(与内置名冲突会顶掉内置钮,用专有名 mermaid)
          name: 'mermaid',
          hotkey: '',
          tip: 'Mermaid',
          // tipPosition 必配(2026-09-24):MenuItem 构造拼 className="vditor-tooltipped__"+
          // tipPosition,缺省拼出 __undefined 无方向规则,tooltip ::after 无定位回退静态位置
          tipPosition: 'n',
          className: 'zen-vd-mermaid',
          icon: MERMAID_ICON,
          click: () => {
            vd.insertValue('```mermaid\ngraph LR\n  A --> B\n```')
          },
        },
      ],
      input: (md: string) => {
        // 粘贴标题→加粗(2026-09-22 正文禁标题):按粘贴打标识别,只动插入区间
        // (公共前后缀定位),转换后 setValue 回写 + 光标还原 + toast 提醒;
        // 手输不转换(格式层条件包裹兜底,不与用户输入对抗)
        if (pastedRef.current) {
          pastedRef.current = false
          const { next, converted, caret } = convertPastedHeadings(lastEmittedRef.current ?? '', md)
          if (converted > 0) {
            lastEmittedRef.current = next
            vdRef.current?.setValue(next)
            const ta = hostRef.current?.querySelector('textarea')
            if (ta !== null && ta !== undefined) ta.setSelectionRange(caret, caret)
            onChangeRef.current(next)
            showToast(i18n.t('editor.bodyPanel.headingConverted', { count: converted }))
            return
          }
        }
        lastEmittedRef.current = md
        onChangeRef.current(md)
      },
      after: () => {
        inited = true
        // 工具栏 tooltip 方向适配(2026-09-24 左侧裁剪修复):vditor 给 undo/redo 硬编码
        // tipPosition "nw"(tooltip 右缘锚按钮中线、向左展开)——本组件唯一宿主是弹窗,
        // DialogContent overflow-hidden(圆角裁内容)下最左按钮向左展开必越弹窗左界被裁
        // (e2e 实测 undo 越界 59px 裁 64%,左侧文字不可见);换 "ne"(左缘锚中线-15px
        // 向右展开)全程界内。运行时改方向类与 vditor 官方同构(Fullscreen 回调即此做法);
        // 工具栏仅 undo/redo 是 __nw,initUI 后一次性覆写,无回写竞争
        host.querySelectorAll('.vditor-toolbar .vditor-tooltipped__nw').forEach((b) => {
          b.classList.replace('vditor-tooltipped__nw', 'vditor-tooltipped__ne')
        })
        // 打开即聚焦(2026-09-22):sv 的 textarea 异步 init 后才存在,autoFocus 属性挂不上;
        // Radix 开弹窗默认聚焦内容区首个可聚焦元素(× 关闭钮)——init 完成瞬间把焦点
        // 交给编辑器,用户开弹窗即可输入,无需先点一下编辑区
        vd.focus()
      },
    })
    lastEmittedRef.current = value
    vdRef.current = vd
    return () => {
      vdRef.current = null
      if (inited) {
        vd.destroy()
        return
      }
      // init 未完成即卸载(dev StrictMode 双挂载必经;生产首开脚本慢时关弹窗同窗):
      // 不能 destroy(internal state 未建,读 this.vditor.element 即抛 TypeError);
      // 置 isDestroyed 令挂起的 init() 入口早退——不建 DOM 不挂监听,无需清理。
      // isDestroyed 是 vditor 私有字段,类型面走断言(运行时普通属性赋值)
      ;(vd as unknown as { isDestroyed: boolean }).isDestroyed = true
    }
    // 弹窗生命周期内 lang/theme 不变(模态切不了语言/主题),重建仅防御
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value 只作初值,后续变化走下方受控 effect
  }, [lang, theme])

  // 外部真值变化(非本组件回声)→ 同步进编辑器
  useEffect(() => {
    if (value === lastEmittedRef.current) return
    lastEmittedRef.current = value
    vdRef.current?.setValue(value)
  }, [value])

  // aria-label 消费 editor.bodyPanel.editorLabel(双语):sv 编辑区是 textarea,宿主 div
  // 命名让屏幕阅读器在「节点正文」语境下定位编辑器
  return <div ref={hostRef} data-testid="vditor-host" aria-label={t('editor.bodyPanel.editorLabel')} className="h-full min-h-0" />
}
