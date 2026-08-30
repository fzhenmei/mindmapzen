// src/editor/zenIcons.ts —— 节点图标集（M18）：lucide-static raw svg 接引擎 iconList 通道
// 引擎约定（nodeCreateContents.js:98-135 + svg/icons.js:288）：data.icon 元素形如
// '<type>_<name>'，经 opt.iconList 的 { type, list:[{name, icon}] } 解析出 svg 字符串；
// /^<svg/ 前缀走 SVG 渲染。我们的 type 固定 'zen'：'zen_flag' ↔ md 标记 '::flag'。
import alertTriangle from 'lucide-static/icons/alert-triangle.svg?raw'
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

/** 精选集（64，图标管理器默认网格 + 引擎 iconList 静态项；kebab 名即 md 标记名） */
export const CURATED_ICONS: Readonly<Record<string, string>> = {
  flag, star, 'alert-triangle': alertTriangle, check, x, clock, flame, heart, bookmark, pin,
  tag, lightbulb, target, rocket, bug, lock, key, eye, search, calendar,
  'message-circle': messageCircle, paperclip, 'trash-2': trash2, pencil, copy, save, download,
  upload, settings, user, users, home, folder, 'file-text': fileText, image, link,
  'external-link': externalLink, 'arrow-right': arrowRight, 'arrow-up': arrowUp,
  'arrow-down': arrowDown, plus, minus, circle, square, zap, cloud, sun, moon,
  coffee, music, camera, phone, mail, map, compass, gift, trophy, medal,
  shield, wrench, hammer, database, code, terminal, 'git-branch': gitBranch,
  package: packageIcon, box, edit,
}

/** 引擎 iconList 项（构造 opts.iconList 用；运行时新增图标直接 push 同结构项） */
export function toEngineIconList(): Array<{ type: string; list: Array<{ name: string; icon: string }> }> {
  return [{ type: 'zen', list: Object.entries(CURATED_ICONS).map(([name, icon]) => ({ name, icon })) }]
}

/** 懒加载任一 lucide 图标（全集 2048 个，动态 import 模板 → Vite 按文件拆 chunk）；
 *  名字不存在返回 null（调用方宽容丢弃） */
export async function loadIconSvg(name: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(name)) return null
  try {
    const mod = (await import(`lucide-static/icons/${name}.svg?raw`)) as { default: string }
    return mod.default
  } catch {
    return null
  }
}
