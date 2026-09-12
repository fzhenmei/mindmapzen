// src/editor/zenIcons.ts —— 节点图标集（M18）：lucide-static raw svg 接引擎 iconList 通道
// 引擎约定（nodeCreateContents.js:98-135 + svg/icons.js:288）：data.icon 元素形如
// '<type>_<name>'，经 opt.iconList 的 { type, list:[{name, icon}] } 解析出 svg 字符串；
// /^<svg/ 前缀走 SVG 渲染。我们的 type 固定 'zen'：'zen_flag' ↔ md 标记 '::flag'。
import type { EngineNode } from '../types/engine'
import { TASK_STATUSES, type TaskStatus } from '../services/statusMarkers'
import alertTriangle from 'lucide-static/icons/alert-triangle.svg?raw'
import archive from 'lucide-static/icons/archive.svg?raw'
import arrowDown from 'lucide-static/icons/arrow-down.svg?raw'
import arrowRight from 'lucide-static/icons/arrow-right.svg?raw'
import arrowUp from 'lucide-static/icons/arrow-up.svg?raw'
import bookmark from 'lucide-static/icons/bookmark.svg?raw'
import box from 'lucide-static/icons/box.svg?raw'
import bug from 'lucide-static/icons/bug.svg?raw'
import calendar from 'lucide-static/icons/calendar.svg?raw'
import camera from 'lucide-static/icons/camera.svg?raw'
import check from 'lucide-static/icons/check.svg?raw'
import circle from 'lucide-static/icons/circle.svg?raw'
import clock from 'lucide-static/icons/clock.svg?raw'
import cloud from 'lucide-static/icons/cloud.svg?raw'
import code from 'lucide-static/icons/code.svg?raw'
import coffee from 'lucide-static/icons/coffee.svg?raw'
import compass from 'lucide-static/icons/compass.svg?raw'
import copy from 'lucide-static/icons/copy.svg?raw'
import database from 'lucide-static/icons/database.svg?raw'
import download from 'lucide-static/icons/download.svg?raw'
import edit from 'lucide-static/icons/edit.svg?raw'
import externalLink from 'lucide-static/icons/external-link.svg?raw'
import eye from 'lucide-static/icons/eye.svg?raw'
import fileText from 'lucide-static/icons/file-text.svg?raw'
import flame from 'lucide-static/icons/flame.svg?raw'
import flaskConical from 'lucide-static/icons/flask-conical.svg?raw'
import flag from 'lucide-static/icons/flag.svg?raw'
import folder from 'lucide-static/icons/folder.svg?raw'
import gift from 'lucide-static/icons/gift.svg?raw'
import gitBranch from 'lucide-static/icons/git-branch.svg?raw'
import hammer from 'lucide-static/icons/hammer.svg?raw'
import heart from 'lucide-static/icons/heart.svg?raw'
import home from 'lucide-static/icons/home.svg?raw'
import image from 'lucide-static/icons/image.svg?raw'
import key from 'lucide-static/icons/key.svg?raw'
import lightbulb from 'lucide-static/icons/lightbulb.svg?raw'
import link from 'lucide-static/icons/link.svg?raw'
import lock from 'lucide-static/icons/lock.svg?raw'
import mail from 'lucide-static/icons/mail.svg?raw'
import map from 'lucide-static/icons/map.svg?raw'
import medal from 'lucide-static/icons/medal.svg?raw'
import messageCircle from 'lucide-static/icons/message-circle.svg?raw'
import minus from 'lucide-static/icons/minus.svg?raw'
import moon from 'lucide-static/icons/moon.svg?raw'
import music from 'lucide-static/icons/music.svg?raw'
import packageIcon from 'lucide-static/icons/package.svg?raw'
import paperclip from 'lucide-static/icons/paperclip.svg?raw'
import pencil from 'lucide-static/icons/pencil.svg?raw'
import phone from 'lucide-static/icons/phone.svg?raw'
import pin from 'lucide-static/icons/pin.svg?raw'
import plus from 'lucide-static/icons/plus.svg?raw'
import rocket from 'lucide-static/icons/rocket.svg?raw'
import save from 'lucide-static/icons/save.svg?raw'
import search from 'lucide-static/icons/search.svg?raw'
import settings from 'lucide-static/icons/settings.svg?raw'
import shield from 'lucide-static/icons/shield.svg?raw'
import square from 'lucide-static/icons/square.svg?raw'
import star from 'lucide-static/icons/star.svg?raw'
import sun from 'lucide-static/icons/sun.svg?raw'
import tag from 'lucide-static/icons/tag.svg?raw'
import target from 'lucide-static/icons/target.svg?raw'
import terminal from 'lucide-static/icons/terminal.svg?raw'
import trash2 from 'lucide-static/icons/trash-2.svg?raw'
import trophy from 'lucide-static/icons/trophy.svg?raw'
import upload from 'lucide-static/icons/upload.svg?raw'
import user from 'lucide-static/icons/user.svg?raw'
import users from 'lucide-static/icons/users.svg?raw'
import wrench from 'lucide-static/icons/wrench.svg?raw'
import x from 'lucide-static/icons/x.svg?raw'
import zap from 'lucide-static/icons/zap.svg?raw'

/** 规范化 lucide svg：剥前导许可注释与空白，确保以 <svg 开头——引擎按此前缀分流
 *  SVG/图片渲染（nodeCreateContents.js /^<svg/.test(src)），lucide-static 文件自带
 *  `<!-- @license -->` 头注释，不剥则被当图片 URL 加载显示为碎图（M18 验收实案） */
const normalizeSvg = (raw: string): string => raw.replace(/^\s*<!--[\s\S]*?-->\s*/, '')

/** 精选集原始表（70，图标管理器默认网格 + 引擎 iconList 静态项；kebab 名即 md 标记名） */
const RAW_CURATED: Readonly<Record<string, string>> = {
  flag, star, 'alert-triangle': alertTriangle, archive, check, x, clock, flame, flask: flaskConical, heart, bookmark, pin,
  tag, lightbulb, target, rocket, bug, lock, key, eye, search, calendar,
  'message-circle': messageCircle, paperclip, 'trash-2': trash2, pencil, copy, save, download,
  upload, settings, user, users, home, folder, 'file-text': fileText, image, link,
  'external-link': externalLink, 'arrow-right': arrowRight, 'arrow-up': arrowUp,
  'arrow-down': arrowDown, plus, minus, circle, square, zap, cloud, sun, moon,
  coffee, music, camera, phone, mail, map, compass, gift, trophy, medal,
  shield, wrench, hammer, database, code, terminal, 'git-branch': gitBranch,
  package: packageIcon, box, edit,
}

/** 精选集（规范化后对外）：值恒以 <svg 开头 */
export const CURATED_ICONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RAW_CURATED).map(([name, svg]) => [name, normalizeSvg(svg)]),
)

/** 状态徽章映射（看板模式）：status → 精选图标名。引擎 getNodeIconListIcon（svg/icons.js:288）
 *  按 name.split('_') 取 arr[0]=type、arr[1]=name 查找——保留名必须 kebab（'zen_status-doing'
 *  恰拆 ['zen','status-doing'] 两段；下划线形态 'zen_status_doing' 会拆出 name='status' 永不命中），
 *  data.icon 元素 'zen_status-<s>'，下方静态注册五项 name 'status-<s>' */
export const STATUS_BADGE_ICON: Readonly<Record<TaskStatus, string>> = {
  todo: 'circle', doing: 'clock', blocked: 'alert-triangle', done: 'check', dropped: 'x',
  archived: 'archive',
}

/** 引擎 iconList 项（构造 opts.iconList 用；运行时新增图标直接 push 同结构项）。
 *  2026-09-06 备注合并：zen_body 内部保留名退役（「有正文」角标由镜像 data.note 驱动
 *  引擎原生通道，不再借道 iconList 静态注册）；2026-09 看板模式：追加五态状态徽章
 *  静态项（name status-<s>，data.icon 'zen_status-<s>' 命中），与用户精选图标同列 */
export function toEngineIconList(): Array<{ type: string; list: Array<{ name: string; icon: string }> }> {
  return [
    {
      type: 'zen',
      list: [
        ...Object.entries(CURATED_ICONS).map(([name, icon]) => ({ name, icon })),
        ...TASK_STATUSES.map((s) => ({ name: `status-${s}`, icon: CURATED_ICONS[STATUS_BADGE_ICON[s]] })),
      ],
    },
  ]
}

/** lucide 节点结构（icon-nodes.json：[tag, attrs, children?] 三元组递归） */
type LucideNode = [tag: string, attrs: Record<string, string>, children?: LucideNode[]]

/** 节点数组 → svg 字符串（lucide 官方 24×24 stroke 骨架 + 递归序列化；
 *  attrs 值做引号转义——lucide 数据本身安全，转义为纵深防御。
 *  class 与精选包内 svg 同构（lucide lucide-<name>），画布/网格断言按名定位不区分来源） */
function nodesToSvg(children: readonly LucideNode[], name: string): string {
  const walk = ([tag, attrs, kids]: LucideNode): string => {
    const a = Object.entries(attrs ?? {})
      .map(([k, v]) => ` ${k}="${String(v).replaceAll('"', '&quot;')}"`)
      .join('')
    return kids !== undefined && kids.length > 0
      ? `<${tag}${a}>${kids.map(walk).join('')}</${tag}>`
      : `<${tag}${a}/>`
  }
  return (
    `<svg class="lucide lucide-${name}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    `stroke-linejoin="round">${children.map(walk).join('')}</svg>`
  )
}

// 全集节点数据懒加载缓存（icon-nodes.json 单 chunk；Vite JSON 动态导入返回 { default }，
// 实案：M18 初版用包内 URL 模板动态 import——运行时无法解析，搜索命中的非精选图标全挂）
let nodesCache: Promise<Record<string, readonly LucideNode[]>> | null = null
const loadNodes = (): Promise<Record<string, readonly LucideNode[]>> => {
  nodesCache ??= import('lucide-static/icon-nodes.json').then(
    (m) => (m as unknown as { default: Record<string, readonly LucideNode[]> }).default,
  )
  return nodesCache
}

/** 懒加载任一 lucide 图标（全集 1790）：精选直取；其余查 icon-nodes.json 序列化。
 *  名字不存在返回 null（调用方宽容丢弃） */
export async function loadIconSvg(name: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(name)) return null
  if (CURATED_ICONS[name] !== undefined) return CURATED_ICONS[name]
  try {
    const nodes = await loadNodes()
    const kids = nodes[name]
    return kids === undefined ? null : nodesToSvg(kids, name)
  } catch {
    return null
  }
}

/** 打开期图标恢复（2026-09 修复）：整树收集「非精选」zen_ 图标名（保序去重）。
 *  非精选图标此前只在图标管理器确认时运行时注册（useIconPicker.apply），重开导图后
 *  iconList 只剩精选 64——md 里 ::name 解析出 data.icon 却无 svg，引擎渲染空占位
 *  （getNodeIconListIcon 未命中返回 ''，实案：::shield-alert ::book-search 全不可见）。
 *  精选 / 非 zen_ 前缀（引擎其他图标源）/ 非法形态全忽略。 */
export function collectUncuratedIcons(root: EngineNode): string[] {
  const out: string[] = []
  const walk = (n: EngineNode): void => {
    if (Array.isArray(n.data.icon)) {
      for (const item of n.data.icon) {
        if (typeof item !== 'string' || !item.startsWith('zen_')) continue
        const name = item.slice(4)
        if (CURATED_ICONS[name] !== undefined || out.includes(name)) continue
        out.push(name)
      }
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(root)
  return out
}

/** names 逐个补注册进 iconList 分组 list（iconList[0].list）：已在册 / 加载失败
 *  （名字不在 lucide 全集，宽容丢弃）跳过，返回实际新增数。loader 参数供测试注入。 */
export async function registerIconsInto(
  list: Array<{ name: string; icon: string }>,
  names: readonly string[],
  loader: (name: string) => Promise<string | null> = loadIconSvg,
): Promise<number> {
  const known = new Set(list.map((i) => i.name))
  let added = 0
  for (const n of names) {
    if (known.has(n)) continue
    const svg = await loader(n)
    if (svg === null) continue
    list.push({ name: n, icon: svg })
    known.add(n)
    added += 1
  }
  return added
}

/** 渲染安全的 reRender（2026-09 双树错乱修复）：引擎 reRender()（index.js:308-313）会在
 *  isRendering=true（渲染进行中，doLayout 经 asyncRun 跨多个宏任务，大图窗口数百毫秒）时
 *  调用则「clearCache 清掉进行中渲染的销毁名单 + clearDraw 后节点又被渲染回调 add 回来」，
 *  旧树实例无人销毁、DOM 残留，下一轮（reRender 标志仍置位）全量新建——画布出现新旧两份
 *  完整树（实验复现：53 节点图 ×2=106 个 .smm-node；用户实案 47×2=94，随后窗口最大化把
 *  新树按新尺寸重排、旧树停留在旧布局，两树错位重叠即「导图错乱/节点重复/无法拖动」，
 *  重开文档重挂载才恢复）。故 isRendering 时挂 node_tree_render_end 一次性回调延后调用——
 *  该事件在 onRenderEnd 里 isRendering=false 之后才发出（Render.js:541-550），回调内调用
 *  恒安全；空闲时直接调用。具名导出供 zenIcons.test 直测。 */
export function safeReRender(mm: ReRenderTarget): void {
  if (mm.renderer?.isRendering) {
    mm.on('node_tree_render_end', function onEnd() {
      mm.off('node_tree_render_end', onEnd)
      mm.reRender?.()
    })
  } else {
    mm.reRender?.()
  }
}

/** safeReRender 最小依赖面（引擎实例的结构子集，测试替身友好） */
export interface ReRenderTarget {
  renderer?: { isRendering?: boolean }
  reRender?(): void
  on(event: string, cb: () => void): void
  off(event: string, cb: () => void): void
}
