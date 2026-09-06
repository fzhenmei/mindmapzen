// website/src/content/index.ts —— 构建期选语言(vite build --mode en 出英文版);
// 两份词典静态引入(增量约 10KB,免运行时加载闪烁)
import { en } from './en'
import { zh } from './zh'

export const IS_EN = import.meta.env.MODE === 'en'
export const L = IS_EN ? en : zh
