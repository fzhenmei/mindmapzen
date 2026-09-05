import type { Variants } from 'motion/react'

/** 官网全局入场编排:所有节共用同一套变体,保证节奏一致。
 *  手法限于淡入 + 位移(zen 克制);reduced-motion 由 App 层
 *  MotionConfig reducedMotion="user" 统一降级(仅保留淡入)。 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** 节容器:进入视口后,直接子级按 90ms 步进交错浮现 */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.05, staggerChildren: 0.09 } },
}

/** 块级入场:淡入 + 14px 上移 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}

/** 列表容器:自身入场的同时,继续向下编排子级(卡片/要点/下载项) */
export const fadeUpThenStagger: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE, delayChildren: 0.15, staggerChildren: 0.06 },
  },
}

/** 表格行:更轻的位移与时长(tr 上的 transform 在个别老引擎缺失时退化为纯淡入) */
export const rowIn: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

/** 行组编排:自身不动,只给行做交错(等表块基本就位再起) */
export const rowStagger: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.25, staggerChildren: 0.05 } },
}
